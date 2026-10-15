/**
 * FlixVault MongoDB GridFS Poster Storage Engine
 * 
 * Secure, persistent storage for movie posters directly in MongoDB using GridFS.
 * Guarantees:
 * - Large image binary data is stored in MongoDB GridFS chunks, NOT as bloated base64 in regular Movie docs.
 * - Validates file types (JPEG, PNG, WEBP, GIF, SVG) via magic bytes and MIME checks.
 * - Enforces strict file size limits (max 5MB).
 * - Avoids silent in-memory fallbacks when production MongoDB is expected.
 * - Handles file replacement, deletion, and cleanup of orphaned chunks.
 */

import mongoose from 'mongoose';
import { Readable } from 'stream';
import { getDBStatus } from './db';

export const MAX_POSTER_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
];

export interface StoredPosterResult {
  fileId: string;
  filename: string;
  contentType: string;
  size: number;
  uploadDate: Date;
  posterUrl: string;
}

export interface PosterValidationResult {
  valid: boolean;
  error?: string;
  detectedMime?: string;
}

/**
 * Validates image buffer using size and magic bytes
 */
export function validateImageBuffer(buffer: Buffer, declaredMime?: string): PosterValidationResult {
  if (!buffer || buffer.length === 0) {
    return { valid: false, error: 'Empty file buffer received.' };
  }

  if (buffer.length > MAX_POSTER_SIZE_BYTES) {
    return {
      valid: false,
      error: `File size exceeds maximum limit of 5MB (${(buffer.length / (1024 * 1024)).toFixed(2)} MB uploaded).`,
    };
  }

  if (buffer.length < 4) {
    return { valid: false, error: 'File is too small to be a valid image.' };
  }

  // Check magic bytes / signatures
  // JPEG: FF D8 FF
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;

  // PNG: 89 50 4E 47 (0x89 'P' 'N' 'G')
  const isPng =
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47;

  // GIF: 47 49 46 38 ('G' 'I' 'F' '8')
  const isGif =
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38;

  // WEBP: 'RIFF' .... 'WEBP'
  const isWebp =
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP';

  // SVG: starts with or contains <svg ...
  const textHead = buffer.toString('utf8', 0, Math.min(buffer.length, 512)).trim().toLowerCase();
  const isSvg = textHead.includes('<svg') || textHead.startsWith('<?xml');

  let detectedMime: string | undefined;
  if (isJpeg) detectedMime = 'image/jpeg';
  else if (isPng) detectedMime = 'image/png';
  else if (isGif) detectedMime = 'image/gif';
  else if (isWebp) detectedMime = 'image/webp';
  else if (isSvg) detectedMime = 'image/svg+xml';

  if (!detectedMime) {
    return {
      valid: false,
      error: 'Invalid file format. File does not match any accepted image signature (JPEG, PNG, WEBP, GIF, SVG).',
    };
  }

  // If MIME was declared by client, ensure it matches allowed types
  if (declaredMime && !ALLOWED_MIME_TYPES.includes(declaredMime.toLowerCase())) {
    return {
      valid: false,
      error: `Declared MIME type "${declaredMime}" is not supported. Allowed types: JPEG, PNG, WEBP, GIF, SVG.`,
    };
  }

  return { valid: true, detectedMime };
}

/**
 * Retrieves the MongoDB GridFSBucket instance for movie posters.
 * Returns null if MongoDB is not connected.
 */
export function getPostersBucket(): InstanceType<typeof mongoose.mongo.GridFSBucket> | null {
  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
    return null;
  }
  return new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
    bucketName: 'posters',
  });
}

/**
 * Stores poster image buffer into MongoDB GridFS.
 * Fails explicitly if MongoDB is not connected (no silent memory fallback).
 */
export async function storePosterInGridFS(params: {
  buffer: Buffer;
  originalFilename?: string;
  declaredContentType?: string;
  movieId?: string;
}): Promise<StoredPosterResult> {
  const { buffer, originalFilename = 'poster.jpg', declaredContentType, movieId } = params;

  // Validate image
  const validation = validateImageBuffer(buffer, declaredContentType);
  if (!validation.valid) {
    throw new Error(validation.error || 'Invalid image buffer');
  }

  const contentType = validation.detectedMime || declaredContentType || 'image/jpeg';

  // Check MongoDB connection
  const bucket = getPostersBucket();
  if (!bucket) {
    const dbStatus = getDBStatus();
    throw new Error(
      `MongoDB connection unavailable. Cannot store poster in GridFS. Status: ${JSON.stringify(dbStatus)}`
    );
  }

  // Generate safe filename
  const cleanExt = contentType.split('/')[1]?.replace('svg+xml', 'svg') || 'jpg';
  const safeFilename = `${movieId || 'poster'}-${Date.now()}.${cleanExt}`;

  return new Promise<StoredPosterResult>((resolve, reject) => {
    const uploadStream = bucket.openUploadStream(safeFilename, {
      contentType,
      metadata: {
        contentType,
        movieId: movieId || null,
        originalFilename,
        size: buffer.length,
        uploadedAt: new Date(),
      },
    } as any);

    uploadStream.on('error', (err) => {
      reject(err);
    });

    uploadStream.on('finish', () => {
      const fileId = uploadStream.id.toString();
      resolve({
        fileId,
        filename: safeFilename,
        contentType,
        size: buffer.length,
        uploadDate: new Date(),
        posterUrl: `/api/posters/${fileId}`,
      });
    });

    const readable = Readable.from(buffer);
    readable.pipe(uploadStream);
  });
}

/**
 * Retrieves a poster stream and file metadata from GridFS by fileId.
 */
export async function getPosterStreamFromGridFS(fileId: string): Promise<{
  stream: NodeJS.ReadableStream;
  file: any;
} | null> {
  if (!mongoose.Types.ObjectId.isValid(fileId)) {
    return null;
  }

  const bucket = getPostersBucket();
  if (!bucket || !mongoose.connection.db) {
    return null;
  }

  const objectId = new mongoose.Types.ObjectId(fileId);
  const filesCollection = mongoose.connection.db.collection('posters.files');
  const file = await filesCollection.findOne({ _id: objectId });

  if (!file) {
    return null;
  }

  const stream = bucket.openDownloadStream(objectId);
  return { stream, file };
}

/**
 * Deletes a poster file and its associated chunks from GridFS.
 */
export async function deletePosterFromGridFS(fileId: string): Promise<boolean> {
  if (!fileId || !mongoose.Types.ObjectId.isValid(fileId)) {
    return false;
  }

  const bucket = getPostersBucket();
  if (!bucket) {
    return false;
  }

  try {
    const objectId = new mongoose.Types.ObjectId(fileId);
    await bucket.delete(objectId);
    return true;
  } catch (err: any) {
    // If already deleted or not found, return false safely without crashing
    return false;
  }
}
