import { Router, Request, Response } from 'express';
import { MovieModel } from '../models/Movie';
import { StorefrontSettingsModel } from '../models/StorefrontSettings';
import { OrderModel } from '../models/Order';
import { memoryStore, getDBStatus, initDatabase, DEFAULT_UPI_CONFIG } from '../db';
import { requireAdminAuth } from '../auth';
import { validateUpiVpa, resolveUpiConfig } from '../upi';
import {
  getSafeGmailConfigStatus,
  testGmailImapConnection,
  fetchRecentEmailDiagnostics,
  getGmailConfig,
} from '../gmail';
import { parsePaymentAlert } from '../fampayParser';
import {
  runPaymentVerificationScan,
  verifyOrderWithAlert,
  updateOrderVerification,
  maskUtr,
  findOrderById,
} from '../paymentVerifier';
import multer from 'multer';
import {
  storePosterInGridFS,
  deletePosterFromGridFS,
  validateImageBuffer,
  MAX_POSTER_SIZE_BYTES,
} from '../posterStorage';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_POSTER_SIZE_BYTES,
  },
});

export const adminRouter = Router();

// Protect ALL routes in this router with secure session verification
adminRouter.use(requireAdminAuth);

// GET /api/admin/db/status: Diagnostic endpoint for MongoDB Atlas connectivity
adminRouter.get('/db/status', (_req: Request, res: Response) => {
  res.json({ success: true, dbStatus: getDBStatus() });
});

// POST /api/admin/db/retry: Retry connection to MongoDB Atlas
adminRouter.post('/db/retry', async (_req: Request, res: Response) => {
  try {
    const success = await initDatabase(true);
    res.json({ success, dbStatus: getDBStatus() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Retry failed', dbStatus: getDBStatus() });
  }
});

// Helper: Ensure exactly one active movie is featured
async function ensureFeaturedConsistency(excludeId?: string): Promise<void> {
  const dbStatus = getDBStatus();

  if (dbStatus.connected) {
    const hasFeatured = await MovieModel.exists({
      isEnabled: true,
      isFeatured: true,
      ...(excludeId ? { id: { $ne: excludeId } } : {}),
    });

    if (!hasFeatured) {
      // Pick first enabled movie and make it featured
      const firstActive = await MovieModel.findOne({
        isEnabled: true,
        ...(excludeId ? { id: { $ne: excludeId } } : {}),
      }).sort({ createdAt: -1 });

      if (firstActive) {
        firstActive.isFeatured = true;
        await firstActive.save();
      }
    }
  } else {
    // Memory store
    const hasFeatured = memoryStore.movies.some(
      (m: any) => m.isEnabled !== false && m.isFeatured && m.id !== excludeId
    );
    if (!hasFeatured) {
      const firstActive = memoryStore.movies.find(
        (m: any) => m.isEnabled !== false && m.id !== excludeId
      );
      if (firstActive) {
        firstActive.isFeatured = true;
      }
    }
  }
}

// GET /api/admin/movies: Retrieve all movies (published and drafts)
adminRouter.get('/movies', async (_req: Request, res: Response) => {
  try {
    const dbStatus = getDBStatus();
    let movies: any[] = [];

    if (dbStatus.connected) {
      movies = await MovieModel.find({}).sort({ isFeatured: -1, createdAt: -1 }).lean();
    } else {
      movies = memoryStore.movies;
    }

    res.json({
      movies,
      count: movies.length,
      storage: dbStatus.connected ? 'mongodb' : 'memory-fallback',
    });
  } catch (err: any) {
    console.error('Admin get movies error:', err);
    res.status(500).json({ error: 'Failed to retrieve admin movies.' });
  }
});

// POST /api/admin/movies: Create a new movie
adminRouter.post('/movies', async (req: Request, res: Response) => {
  try {
    const data = req.body;

    // Validation
    if (!data.title?.trim()) {
      res.status(400).json({ error: 'Movie title is required.' });
      return;
    }
    if (!data.synopsis?.trim()) {
      res.status(400).json({ error: 'Movie synopsis is required.' });
      return;
    }
    if (!data.priceSample?.trim()) {
      res.status(400).json({ error: 'Price is required.' });
      return;
    }

    const id = data.id || `mv-${Date.now().toString().slice(-4)}`;
    const isFeatured = !!data.isFeatured;
    const isEnabled = data.isEnabled !== false;

    const dbStatus = getDBStatus();

    if (dbStatus.connected) {
      // If newly created movie is featured, un-feature all others
      if (isFeatured) {
        await MovieModel.updateMany({}, { isFeatured: false });
      }

      const newMovie = new MovieModel({
        ...data,
        id,
        isFeatured,
        isEnabled,
      });

      await newMovie.save();

      // If no movie is featured, ensure consistency
      await ensureFeaturedConsistency();

      res.status(201).json({
        success: true,
        movie: newMovie,
        message: 'Movie created successfully in MongoDB.',
      });
    } else {
      // Memory Store
      if (isFeatured) {
        memoryStore.movies.forEach((m: any) => (m.isFeatured = false));
      }

      const newMovie = {
        ...data,
        id,
        isFeatured,
        isEnabled,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      memoryStore.movies.unshift(newMovie);
      await ensureFeaturedConsistency();

      res.status(201).json({
        success: true,
        movie: newMovie,
        message: 'Movie created successfully in session memory.',
      });
    }
  } catch (err: any) {
    console.error('Admin create movie error:', err);
    res.status(500).json({ error: err.message || 'Failed to create movie.' });
  }
});

// PUT /api/admin/movies/:id: Update an existing movie
adminRouter.put('/movies/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = req.body;

    if (!data.title?.trim()) {
      res.status(400).json({ error: 'Movie title is required.' });
      return;
    }
    if (!data.synopsis?.trim()) {
      res.status(400).json({ error: 'Movie synopsis is required.' });
      return;
    }

    const dbStatus = getDBStatus();
    const isFeatured = !!data.isFeatured;

    if (dbStatus.connected) {
      if (isFeatured) {
        await MovieModel.updateMany({ id: { $ne: id } }, { isFeatured: false });
      }

      const existing = await MovieModel.findOne({ id });
      if (!existing) {
        res.status(404).json({ error: 'Movie not found.' });
        return;
      }

      // Cleanup prior poster from MongoDB GridFS if replaced or removed
      if (
        existing.posterStorageId &&
        data.posterStorageId !== undefined &&
        existing.posterStorageId !== data.posterStorageId
      ) {
        try {
          await deletePosterFromGridFS(existing.posterStorageId);
        } catch (cleanupErr) {
          console.warn('Failed to delete replaced poster from GridFS:', cleanupErr);
        }
      }

      const updated = await MovieModel.findOneAndUpdate(
        { id },
        { ...data, isFeatured },
        { new: true, runValidators: true }
      );

      // Ensure at least one active movie is featured
      await ensureFeaturedConsistency();

      res.json({
        success: true,
        movie: updated,
        message: 'Movie updated successfully in MongoDB.',
      });
    } else {
      // Memory Store
      const idx = memoryStore.movies.findIndex((m: any) => m.id === id);
      if (idx === -1) {
        res.status(404).json({ error: 'Movie not found.' });
        return;
      }

      if (isFeatured) {
        memoryStore.movies.forEach((m: any) => {
          if (m.id !== id) m.isFeatured = false;
        });
      }

      memoryStore.movies[idx] = {
        ...memoryStore.movies[idx],
        ...data,
        isFeatured,
        updatedAt: new Date(),
      };

      await ensureFeaturedConsistency();

      res.json({
        success: true,
        movie: memoryStore.movies[idx],
        message: 'Movie updated successfully in session memory.',
      });
    }
  } catch (err: any) {
    console.error('Admin update movie error:', err);
    res.status(500).json({ error: err.message || 'Failed to update movie.' });
  }
});

// DELETE /api/admin/movies/:id: Delete a movie
adminRouter.delete('/movies/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const dbStatus = getDBStatus();

    if (dbStatus.connected) {
      const deleted = await MovieModel.findOneAndDelete({ id });
      if (!deleted) {
        res.status(404).json({ error: 'Movie not found.' });
        return;
      }

      // Cleanup poster from MongoDB GridFS if present
      if (deleted.posterStorageId) {
        try {
          await deletePosterFromGridFS(deleted.posterStorageId);
        } catch (cleanupErr) {
          console.warn('Failed to delete poster from GridFS on movie delete:', cleanupErr);
        }
      }

      // If deleted was featured, elect another
      await ensureFeaturedConsistency();

      res.json({
        success: true,
        message: 'Movie deleted successfully from MongoDB.',
      });
    } else {
      const idx = memoryStore.movies.findIndex((m: any) => m.id === id);
      if (idx === -1) {
        res.status(404).json({ error: 'Movie not found.' });
        return;
      }

      const existingPosterId = memoryStore.movies[idx].posterStorageId;
      if (existingPosterId) {
        try {
          await deletePosterFromGridFS(existingPosterId);
        } catch (cleanupErr) {
          console.warn('Failed to delete poster from GridFS on movie delete (memory):', cleanupErr);
        }
      }

      memoryStore.movies.splice(idx, 1);
      await ensureFeaturedConsistency();

      res.json({
        success: true,
        message: 'Movie deleted successfully from session memory.',
      });
    }
  } catch (err: any) {
    console.error('Admin delete movie error:', err);
    res.status(500).json({ error: 'Failed to delete movie.' });
  }
});

// POST /api/admin/posters/upload: Standalone upload directly to MongoDB GridFS
adminRouter.post(
  '/posters/upload',
  (req: Request, res: Response, next) => {
    upload.single('poster')(req, res, (err: any) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          res.status(400).json({
            error: 'File size exceeds maximum limit of 5MB.',
            code: 'FILE_TOO_LARGE',
          });
          return;
        }
        res.status(400).json({ error: err.message || 'File upload failed.' });
        return;
      }
      next();
    });
  },
  async (req: Request, res: Response) => {
    try {
      const dbStatus = getDBStatus();

      // Guard: Do not silently fallback to in-memory storage for production poster uploads
      if (!dbStatus.connected) {
        res.status(503).json({
          error: 'MongoDB connection required. Movie posters must be stored persistently in MongoDB GridFS.',
          code: 'DATABASE_DISCONNECTED',
        });
        return;
      }

      const file = req.file;
      if (!file) {
        res.status(400).json({ error: 'No poster image file provided in request.' });
        return;
      }

      // Validate buffer magic bytes and size
      const validation = validateImageBuffer(file.buffer, file.mimetype);
      if (!validation.valid) {
        res.status(400).json({ error: validation.error });
        return;
      }

      // Store in MongoDB GridFS
      const result = await storePosterInGridFS({
        buffer: file.buffer,
        originalFilename: file.originalname,
        declaredContentType: file.mimetype,
      });

      res.status(201).json({
        success: true,
        fileId: result.fileId,
        posterUrl: result.posterUrl,
        contentType: result.contentType,
        size: result.size,
        filename: result.filename,
        message: 'Movie poster uploaded and stored in MongoDB GridFS successfully.',
      });
    } catch (err: any) {
      console.error('Error uploading poster to GridFS:', err);
      res.status(500).json({
        error: err.message || 'Failed to upload movie poster to MongoDB GridFS.',
      });
    }
  }
);

// POST /api/admin/movies/:id/poster: Upload and attach poster to an existing movie
adminRouter.post(
  '/movies/:id/poster',
  (req: Request, res: Response, next) => {
    upload.single('poster')(req, res, (err: any) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          res.status(400).json({
            error: 'File size exceeds maximum limit of 5MB.',
            code: 'FILE_TOO_LARGE',
          });
          return;
        }
        res.status(400).json({ error: err.message || 'File upload failed.' });
        return;
      }
      next();
    });
  },
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const dbStatus = getDBStatus();

      if (!dbStatus.connected) {
        res.status(503).json({
          error: 'MongoDB connection required. Movie posters must be stored persistently in MongoDB GridFS.',
          code: 'DATABASE_DISCONNECTED',
        });
        return;
      }

      const file = req.file;
      if (!file) {
        res.status(400).json({ error: 'No poster image file provided.' });
        return;
      }

      // Validate file
      const validation = validateImageBuffer(file.buffer, file.mimetype);
      if (!validation.valid) {
        res.status(400).json({ error: validation.error });
        return;
      }

      // Find movie
      const movie = await MovieModel.findOne({ id });
      if (!movie) {
        res.status(404).json({ error: 'Movie not found.' });
        return;
      }

      // Delete old poster from GridFS if replacing
      if (movie.posterStorageId) {
        try {
          await deletePosterFromGridFS(movie.posterStorageId);
        } catch (oldErr) {
          console.warn('Could not delete prior poster from GridFS:', oldErr);
        }
      }

      // Store in GridFS
      const result = await storePosterInGridFS({
        buffer: file.buffer,
        originalFilename: file.originalname,
        declaredContentType: file.mimetype,
        movieId: id,
      });

      // Update movie document
      movie.posterStorageId = result.fileId;
      movie.customPosterUrl = `/api/movies/${id}/poster?v=${Date.now()}`;
      movie.posterContentType = result.contentType;
      movie.posterSize = result.size;
      movie.posterUpdatedAt = new Date();
      await movie.save();

      res.json({
        success: true,
        movie,
        poster: result,
        message: 'Poster uploaded and attached to movie successfully.',
      });
    } catch (err: any) {
      console.error('Error attaching poster to movie:', err);
      res.status(500).json({
        error: err.message || 'Failed to attach poster to movie.',
      });
    }
  }
);

// DELETE /api/admin/movies/:id/poster: Remove poster from a movie and GridFS
adminRouter.delete('/movies/:id/poster', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const dbStatus = getDBStatus();

    if (dbStatus.connected) {
      const movie = await MovieModel.findOne({ id });
      if (!movie) {
        res.status(404).json({ error: 'Movie not found.' });
        return;
      }

      if (movie.posterStorageId) {
        await deletePosterFromGridFS(movie.posterStorageId);
      }

      movie.posterStorageId = '';
      movie.customPosterUrl = '';
      movie.posterContentType = '';
      movie.posterSize = 0;
      movie.posterUpdatedAt = undefined;
      await movie.save();

      res.json({
        success: true,
        movie,
        message: 'Movie poster removed from GridFS and document successfully.',
      });
    } else {
      const idx = memoryStore.movies.findIndex((m: any) => m.id === id);
      if (idx === -1) {
        res.status(404).json({ error: 'Movie not found.' });
        return;
      }

      const existingId = memoryStore.movies[idx].posterStorageId;
      if (existingId) {
        await deletePosterFromGridFS(existingId);
      }

      memoryStore.movies[idx].posterStorageId = '';
      memoryStore.movies[idx].customPosterUrl = '';
      memoryStore.movies[idx].posterContentType = '';
      memoryStore.movies[idx].posterSize = 0;

      res.json({
        success: true,
        movie: memoryStore.movies[idx],
        message: 'Movie poster removed successfully.',
      });
    }
  } catch (err: any) {
    console.error('Error removing movie poster:', err);
    res.status(500).json({ error: 'Failed to remove movie poster.' });
  }
});

// PATCH /api/admin/movies/:id/feature: Set primary hero
adminRouter.patch('/movies/:id/feature', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const dbStatus = getDBStatus();

    if (dbStatus.connected) {
      await MovieModel.updateMany({}, { isFeatured: false });
      const featured = await MovieModel.findOneAndUpdate(
        { id },
        { isFeatured: true, isEnabled: true },
        { new: true }
      );

      if (!featured) {
        res.status(404).json({ error: 'Movie not found.' });
        return;
      }

      res.json({ success: true, movie: featured });
    } else {
      memoryStore.movies.forEach((m: any) => {
        m.isFeatured = m.id === id;
        if (m.id === id) m.isEnabled = true;
      });

      const featured = memoryStore.movies.find((m: any) => m.id === id);
      if (!featured) {
        res.status(404).json({ error: 'Movie not found.' });
        return;
      }

      res.json({ success: true, movie: featured });
    }
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to set featured movie.' });
  }
});

// PATCH /api/admin/movies/:id/toggle: Toggle isEnabled publication status
adminRouter.patch('/movies/:id/toggle', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const dbStatus = getDBStatus();

    if (dbStatus.connected) {
      const movie = await MovieModel.findOne({ id });
      if (!movie) {
        res.status(404).json({ error: 'Movie not found.' });
        return;
      }

      movie.isEnabled = movie.isEnabled === false ? true : false;
      await movie.save();

      await ensureFeaturedConsistency();

      res.json({ success: true, movie });
    } else {
      const movie = memoryStore.movies.find((m: any) => m.id === id);
      if (!movie) {
        res.status(404).json({ error: 'Movie not found.' });
        return;
      }

      movie.isEnabled = movie.isEnabled === false ? true : false;
      await ensureFeaturedConsistency();

      res.json({ success: true, movie });
    }
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to toggle movie publication status.' });
  }
});

// GET /api/admin/settings: Retrieve admin storefront & Telegram configuration
adminRouter.get('/settings', async (_req: Request, res: Response) => {
  try {
    const dbStatus = getDBStatus();
    let settings: any = null;

    if (dbStatus.connected) {
      settings = await StorefrontSettingsModel.findOne({ key: 'global' }).lean();
    } else {
      settings = memoryStore.settings;
    }

    res.json({
      settings,
      database: dbStatus,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve settings.' });
  }
});

// PUT /api/admin/settings: Update storefront & Telegram settings
adminRouter.put('/settings', async (req: Request, res: Response) => {
  try {
    const data = req.body;
    const dbStatus = getDBStatus();

    if (dbStatus.connected) {
      const updated = await StorefrontSettingsModel.findOneAndUpdate(
        { key: 'global' },
        { ...data, key: 'global' },
        { upsert: true, new: true }
      );
      res.json({ success: true, settings: updated });
    } else {
      memoryStore.settings = {
        ...memoryStore.settings,
        ...data,
      };
      res.json({ success: true, settings: memoryStore.settings });
    }
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update settings.' });
  }
});

// GET /api/admin/orders: Retrieve recent pay-per-movie orders with accurate statuses
adminRouter.get('/orders', async (_req: Request, res: Response) => {
  try {
    const dbStatus = getDBStatus();
    let orders: any[] = [];
    const now = new Date();

    if (dbStatus.connected) {
      // Auto-update expired pending orders in MongoDB
      await OrderModel.updateMany(
        { status: 'pending', expiresAt: { $lt: now } },
        { $set: { status: 'expired' } }
      );
      orders = await OrderModel.find({}).sort({ createdAt: -1 }).limit(50).lean();
    } else {
      // Auto-update expired pending orders in memory
      memoryStore.orders.forEach((o: any) => {
        if (o.status === 'pending' && new Date(o.expiresAt) < now) {
          o.status = 'expired';
        }
      });
      orders = [...memoryStore.orders].reverse();
    }

    // Ensure safe masking of UTRs
    const sanitizedOrders = orders.map((o: any) => ({
      ...o,
      maskedUtr: o.maskedUtr || (o.matchedUtr ? maskUtr(o.matchedUtr) : o.userUtr ? maskUtr(o.userUtr) : undefined),
    }));

    res.json({ orders: sanitizedOrders, count: sanitizedOrders.length });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve orders.' });
  }
});

// POST /api/admin/orders/verify-payments: Trigger automated IMAP Payment Verification Scan
adminRouter.post('/orders/verify-payments', async (req: Request, res: Response) => {
  try {
    const limit = parseInt((req.body?.limit as string) || '20', 10);
    const result = await runPaymentVerificationScan(limit);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({
      success: false,
      scannedEmailsCount: 0,
      ordersVerifiedCount: 0,
      ordersNeedsReviewCount: 0,
      duplicatesRejectedCount: 0,
      details: [],
      durationMs: 0,
      error: 'Failed to complete payment verification scan.',
    });
  }
});

// POST /api/admin/orders/:orderId/verify: Attempt verification for a specific order
adminRouter.post('/orders/:orderId/verify', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const order = await findOrderById(orderId);

    if (!order) {
      res.status(404).json({ error: `Order ${orderId} not found.` });
      return;
    }

    if (order.status === 'verified') {
      res.json({
        success: true,
        message: 'Order is already verified.',
        order: {
          ...order,
          maskedUtr: order.maskedUtr || maskUtr(order.matchedUtr),
        },
      });
      return;
    }

    // Run scan to fetch recent emails and check if this order matches
    const scanResult = await runPaymentVerificationScan(25);
    const updatedOrder = await findOrderById(orderId);

    res.json({
      success: updatedOrder?.status === 'verified',
      order: updatedOrder ? {
        ...updatedOrder,
        maskedUtr: updatedOrder.maskedUtr || maskUtr(updatedOrder.matchedUtr),
      } : null,
      scanResult,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to verify specific order.' });
  }
});

// POST /api/admin/orders/:orderId/resolve-review: Admin manual status resolution for orders in review
adminRouter.post('/orders/:orderId/resolve-review', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const { action, note, utr } = req.body || {};
    const order = await findOrderById(orderId);

    if (!order) {
      res.status(404).json({ error: `Order ${orderId} not found.` });
      return;
    }

    if (action === 'approve') {
      const sanitizedUtr = utr ? String(utr).trim() : order.matchedUtr || 'MANUAL-ADMIN';
      await updateOrderVerification(orderId, {
        status: 'verified',
        matchedUtr: sanitizedUtr,
        maskedUtr: maskUtr(sanitizedUtr),
        verifiedAt: new Date(),
        verificationReason: `Manually approved by administrator: ${note || 'Verified via bank receipt'}`,
      });
    } else if (action === 'reject') {
      await updateOrderVerification(orderId, {
        status: 'failed',
        verificationReason: `Rejected by administrator: ${note || 'Receipt could not be confirmed'}`,
      });
    } else {
      res.status(400).json({ error: 'Action must be "approve" or "reject".' });
      return;
    }

    const updated = await findOrderById(orderId);
    res.json({ success: true, order: updated });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update order review status.' });
  }
});

// POST /api/admin/orders/simulate-alert-verification: Diagnostic simulation of payment alert against orders
adminRouter.post('/orders/simulate-alert-verification', async (req: Request, res: Response) => {
  try {
    const { from, subject, text, html, date, orderId } = req.body || {};
    const config = getGmailConfig();

    const parsed = parsePaymentAlert(
      {
        from: from || '',
        subject: subject || '',
        text: text || '',
        html: html || '',
        date: date || new Date().toISOString(),
      },
      config.verifiedSender
    );

    let targetOrder = null;
    if (orderId) {
      targetOrder = await findOrderById(orderId);
    } else if (parsed.detectedOrderRef) {
      targetOrder = await findOrderById(parsed.detectedOrderRef);
    }

    if (!targetOrder) {
      res.status(400).json({
        error: 'Target order not found. Specify an existing orderId or include a valid FLX-... reference in the email.',
        parsedAlert: parsed,
      });
      return;
    }

    const verificationResult = await verifyOrderWithAlert(targetOrder, parsed, {
      emailDate: date,
      allowDirectIdMatch: Boolean(orderId),
    });

    const updatedOrder = await findOrderById(targetOrder.orderId);

    res.json({
      success: verificationResult.success,
      parsedAlert: parsed,
      verificationResult,
      order: updatedOrder,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Simulation error: ' + (err.message || 'Unknown') });
  }
});

// GET /api/admin/upi-config: Retrieve current UPI payment configuration
adminRouter.get('/upi-config', async (_req: Request, res: Response) => {
  try {
    const dbStatus = getDBStatus();
    let upiConfig = DEFAULT_UPI_CONFIG;

    if (dbStatus.connected) {
      const settings = await StorefrontSettingsModel.findOne({ key: 'global' }).lean();
      if (settings?.upiConfig) {
        upiConfig = settings.upiConfig;
      }
    } else {
      if (memoryStore.settings?.upiConfig) {
        upiConfig = memoryStore.settings.upiConfig;
      }
    }

    const resolved = resolveUpiConfig(upiConfig.upiVpa, upiConfig.payeeName);
    res.json({
      upiConfig: {
        ...upiConfig,
        upiVpa: resolved.upiVpa,
        payeeName: resolved.payeeName,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve UPI configuration.' });
  }
});

// PUT /api/admin/upi-config: Update UPI payment configuration
adminRouter.put('/upi-config', async (req: Request, res: Response) => {
  try {
    const { upiVpa, payeeName } = req.body || {};

    const vpaValidation = validateUpiVpa(upiVpa);
    if (!vpaValidation.isValid || !vpaValidation.vpa) {
      res.status(400).json({ error: vpaValidation.error || 'Valid UPI ID (VPA) is required.' });
      return;
    }

    const dbStatus = getDBStatus();
    const upiConfig = {
      upiVpa: vpaValidation.vpa,
      payeeName: (payeeName || 'FlixVault Cinema').trim(),
      paiseMinRange: 1,
      paiseMaxRange: 99,
    };

    if (dbStatus.connected) {
      await StorefrontSettingsModel.findOneAndUpdate(
        { key: 'global' },
        { upiConfig, key: 'global' },
        { upsert: true }
      );
    } else {
      memoryStore.settings.upiConfig = upiConfig;
    }

    res.json({ success: true, upiConfig });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update UPI configuration.' });
  }
});

// =============================================================================
// Phase 3A: Gmail IMAP & FamPay Diagnostic Endpoints
// =============================================================================

// GET /api/admin/gmail/status: Retrieve safe Gmail IMAP configuration status
adminRouter.get('/gmail/status', (_req: Request, res: Response) => {
  try {
    const status = getSafeGmailConfigStatus();
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve Gmail configuration status.' });
  }
});

// POST /api/admin/gmail/test-connection: Verify connection to Gmail IMAP server over SSL
adminRouter.post('/gmail/test-connection', async (_req: Request, res: Response) => {
  try {
    const result = await testGmailImapConnection();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: 'Unexpected error during Gmail connection test.',
      durationMs: 0,
      error: 'Internal server error',
    });
  }
});

// POST /api/admin/gmail/diagnose-parser: Test parser against a sample or synthetic email
adminRouter.post('/gmail/diagnose-parser', (req: Request, res: Response) => {
  try {
    const { from, subject, text, html, date } = req.body || {};
    const config = getGmailConfig();

    if (!from && !subject && !text && !html) {
      res.status(400).json({ error: 'At least one email field (from, subject, or text) is required.' });
      return;
    }

    const result = parsePaymentAlert(
      {
        from: from || '',
        subject: subject || '',
        text: text || '',
        html: html || '',
        date: date || new Date().toISOString(),
      },
      config.verifiedSender
    );

    res.json({ success: true, result });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to run diagnostic parser.' });
  }
});

// GET /api/admin/gmail/recent-alerts: Safely check recent inbox headers/diagnostics
adminRouter.get('/gmail/recent-alerts', async (req: Request, res: Response) => {
  try {
    const limit = parseInt((req.query.limit as string) || '10', 10);
    const result = await fetchRecentEmailDiagnostics(limit);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({
      success: false,
      count: 0,
      emails: [],
      error: 'Failed to retrieve recent email diagnostics.',
    });
  }
});

