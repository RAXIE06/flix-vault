// api/index.ts — Full Backend (MongoDB + All Routes)
import express from 'express';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

// ============================================================
// MONGODB CONNECTION (Cached for serverless)
// ============================================================
let cached = (global as any).mongoose;
if (!cached) {
  cached = (global as any).mongoose = { conn: null, promise: null };
}

async function connectDB() {
  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    const MONGODB_URI = process.env.MONGODB_URI;
    if (!MONGODB_URI) throw new Error('MONGODB_URI not set');

    cached.promise = mongoose.connect(MONGODB_URI, {
      bufferCommands: false,
      maxPoolSize: 5,
      serverSelectionTimeoutMS: 10000,
    });
  }

  try {
    cached.conn = await cached.promise;
    console.log('[DB] MongoDB connected:', mongoose.connection.name);
  } catch (e: any) {
    cached.promise = null;
    console.error('[DB] Connection failed:', e.message);
    throw e;
  }

  return cached.conn;
}

// Fire connection attempt on cold start (non-blocking)
connectDB().catch((e) => console.error('[DB] Initial connect failed:', e.message));

// ============================================================
// EXPRESS APP
// ============================================================
const app = express();

// CORS
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use(cookieParser());

// ============================================================
// MODELS (inline — no separate import needed)
// ============================================================
const MovieSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  title: String,
  year: Number,
  genres: [String],
  duration: String,
  rating: String,
  director: String,
  cast: [String],
  synopsis: String,
  tagline: String,
  priceSample: String,
  priceNumeric: Number,
  accessType: String,
  accessLabel: String,
  resolution: String,
  audio: String,
  isFeatured: { type: Boolean, default: false },
  isEnabled: { type: Boolean, default: true },
  telegramChannelId: String,
  artwork: mongoose.Schema.Types.Mixed,
  posterStorageId: String,
  customPosterUrl: String,
  posterContentType: String,
  posterSize: Number,
  posterUpdatedAt: Date,
}, { timestamps: true, strict: false });

const MovieModel = mongoose.models.Movie || mongoose.model('Movie', MovieSchema);

const SettingsSchema = new mongoose.Schema({
  key: { type: String, unique: true, default: 'global' },
  telegramConfig: mongoose.Schema.Types.Mixed,
  upiConfig: mongoose.Schema.Types.Mixed,
  featuredMovieId: String,
  storefrontMaxTitles: Number,
}, { timestamps: true, strict: false });

const SettingsModel = mongoose.models.StorefrontSettings || mongoose.model('StorefrontSettings', SettingsSchema);

// Poster storage in GridFS
let gridfsBucket: any = null;
function getBucket() {
  if (!gridfsBucket) {
    gridfsBucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
      bucketName: 'posters',
    });
  }
  return gridfsBucket;
}

// ============================================================
// ADMIN AUTH
// ============================================================
import crypto from 'crypto';
const SESSION_COOKIE = 'flixvault_admin_session';
const SECRET = process.env.SESSION_SECRET || 'flixvault_default_secret';
const ADMIN_CODE = process.env.ADMIN_ACCESS_CODE || 'flixvault_admin_2026';
const EXPIRY = 24 * 60 * 60 * 1000;

function createToken() {
  const payload = {
    role: 'admin',
    exp: Date.now() + EXPIRY,
    nonce: crypto.randomBytes(8).toString('hex'),
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(payloadB64).digest('base64url');
  return `${payloadB64}.${sig}`;
}

function verifyToken(token: string | undefined): boolean {
  if (!token || !token.includes('.')) return false;
  const [p, s] = token.split('.');
  if (!p || !s) return false;
  const expected = crypto.createHmac('sha256', SECRET).update(p).digest('base64url');
  if (s.length !== expected.length) return false;
  try {
    if (!crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected))) return false;
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
    return payload.role === 'admin' && Date.now() < payload.exp;
  } catch { return false; }
}

function requireAdmin(req: any, res: any, next: any) {
  const token = req.cookies?.[SESSION_COOKIE] || req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!verifyToken(token)) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// ============================================================
// HEALTH
// ============================================================
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    database: {
      connected: mongoose.connection.readyState === 1,
      name: mongoose.connection.name || null,
      readyState: mongoose.connection.readyState,
    },
    timestamp: new Date().toISOString(),
  });
});

// ============================================================
// PUBLIC ROUTES
// ============================================================
app.get('/api/movies', async (_req, res) => {
  try {
    await connectDB();
    const movies = await MovieModel.find({ isEnabled: { $ne: false } })
      .sort({ isFeatured: -1, createdAt: -1 })
      .lean();
    res.json({ movies, storage: 'mongodb' });
  } catch (err: any) {
    console.error('[MOVIES] Error:', err.message);
    res.status(500).json({ error: 'Failed to load movies' });
  }
});

app.get('/api/settings', async (_req, res) => {
  try {
    await connectDB();
    const settings = await SettingsModel.findOne({ key: 'global' }).lean();
    res.json(settings || { featuredMovieId: '', storefrontMaxTitles: 5 });
  } catch (err: any) {
    console.error('[SETTINGS] Error:', err.message);
    res.status(500).json({ error: 'Failed to load settings' });
  }
});

app.get('/api/movies/:id/poster', async (req, res) => {
  try {
    await connectDB();
    const movie = await MovieModel.findOne({ id: req.params.id }).lean();
    if (!movie?.posterStorageId) return res.status(404).json({ error: 'No poster' });

    const bucket = getBucket();
    const fileId = new mongoose.Types.ObjectId(movie.posterStorageId);
    res.setHeader('Content-Type', movie.posterContentType || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    bucket.openDownloadStream(fileId).pipe(res);
  } catch (err: any) {
    console.error('[POSTER GET] Error:', err.message);
    res.status(500).json({ error: 'Failed to load poster' });
  }
});

// ============================================================
// AUTH ROUTES
// ============================================================
app.post('/api/auth/login', (req, res) => {
  const { accessCode } = req.body || {};
  if (!accessCode || String(accessCode).trim() !== ADMIN_CODE) {
    return res.status(401).json({ error: 'Invalid access code' });
  }
  const token = createToken();
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    maxAge: EXPIRY,
    path: '/',
  });
  res.json({ success: true, token });
});

app.get('/api/auth/me', (req, res) => {
  const token = req.cookies?.[SESSION_COOKIE] || req.headers.authorization?.replace(/^Bearer\s+/i, '');
  res.json({ authenticated: verifyToken(token) });
});

app.post('/api/auth/logout', (_req, res) => {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.json({ success: true });
});

// ============================================================
// ADMIN ROUTES (all protected)
// ============================================================

// Get all movies (including drafts)
app.get('/api/admin/movies', requireAdmin, async (_req, res) => {
  try {
    await connectDB();
    const movies = await MovieModel.find({}).sort({ isFeatured: -1, createdAt: -1 }).lean();
    res.json({ movies, storage: 'mongodb' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to load admin movies' });
  }
});

// Create movie
app.post('/api/admin/movies', requireAdmin, async (req, res) => {
  try {
    await connectDB();
    const data = req.body;
    if (!data.title?.trim()) return res.status(400).json({ error: 'Title required' });
    if (!data.synopsis?.trim()) return res.status(400).json({ error: 'Synopsis required' });

    const id = data.id || `mv-${Date.now().toString().slice(-6)}`;
    const movie = new MovieModel({ ...data, id });
    await movie.save();
    res.status(201).json({ success: true, movie });
  } catch (err: any) {
    console.error('[CREATE MOVIE]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Update movie
app.put('/api/admin/movies/:id', requireAdmin, async (req, res) => {
  try {
    await connectDB();
    const movie = await MovieModel.findOneAndUpdate(
      { id: req.params.id },
      { ...req.body },
      { new: true }
    );
    if (!movie) return res.status(404).json({ error: 'Movie not found' });
    res.json({ success: true, movie });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete movie
app.delete('/api/admin/movies/:id', requireAdmin, async (req, res) => {
  try {
    await connectDB();
    const movie = await MovieModel.findOne({ id: req.params.id });
    if (!movie) return res.status(404).json({ error: 'Movie not found' });

    if (movie.posterStorageId) {
      try {
        const bucket = getBucket();
        await bucket.delete(new mongoose.Types.ObjectId(movie.posterStorageId));
      } catch (e) { /* ignore */ }
    }

    await MovieModel.deleteOne({ id: req.params.id });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Set featured
app.patch('/api/admin/movies/:id/feature', requireAdmin, async (req, res) => {
  try {
    await connectDB();
    await MovieModel.updateMany({}, { isFeatured: false });
    const movie = await MovieModel.findOneAndUpdate(
      { id: req.params.id },
      { isFeatured: true, isEnabled: true },
      { new: true }
    );
    if (!movie) return res.status(404).json({ error: 'Movie not found' });
    res.json({ success: true, movie });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Toggle enabled
app.patch('/api/admin/movies/:id/toggle', requireAdmin, async (req, res) => {
  try {
    await connectDB();
    const movie = await MovieModel.findOne({ id: req.params.id });
    if (!movie) return res.status(404).json({ error: 'Movie not found' });
    movie.isEnabled = !movie.isEnabled;
    await movie.save();
    res.json({ success: true, movie });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// POSTER UPLOAD (Base64 — no multer needed on Vercel)
// Auto-creates movie in MongoDB if not found
// ============================================================
app.post('/api/admin/movies/:id/poster', requireAdmin, async (req, res) => {
  try {
    await connectDB();

    const { imageBase64, filename, contentType } = req.body || {};
    if (!imageBase64) {
      return res.status(400).json({ error: 'No image data provided' });
    }

    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    const ct = contentType || 'image/jpeg';
    if (!allowed.includes(ct)) {
      return res.status(400).json({ error: 'Only JPG/PNG/WEBP allowed' });
    }

    const base64Data = String(imageBase64).replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    if (buffer.length > 5 * 1024 * 1024) {
      return res.status(400).json({ error: 'Image too large (max 5MB)' });
    }

    // Find OR auto-create movie in MongoDB
    let movie = await MovieModel.findOne({ id: req.params.id });
    if (!movie) {
      console.log(`[POSTER] Auto-creating movie in MongoDB: ${req.params.id}`);
      movie = new MovieModel({
        id: req.params.id,
        title: req.params.id,
        synopsis: 'Auto-created on poster upload — details will sync on next save.',
        isEnabled: false,
        isFeatured: false,
        genres: [],
        cast: [],
        year: new Date().getFullYear(),
        duration: '2h 00m',
        rating: 'PG-13',
        director: '',
        priceSample: '₹149',
        priceNumeric: 149,
        resolution: '4K IMAX',
        audio: 'Dolby Atmos',
        accessType: 'pay_per_movie',
        accessLabel: 'Pay per Movie',
        artwork: {
          bgGradient: 'from-violet-950 to-black',
          glowColor: '#a855f7',
          accentColor: '#c084fc',
          motif: 'nebula',
        },
      });
      await movie.save();
    }

    // Delete old poster from GridFS if exists
    if (movie.posterStorageId) {
      try {
        const bucket = getBucket();
        await bucket.delete(new mongoose.Types.ObjectId(movie.posterStorageId));
      } catch (e) { /* ignore */ }
    }

    // Store new poster in GridFS
    const bucket = getBucket();
    const uploadStream = bucket.openUploadStream(
      `poster_${req.params.id}_${Date.now()}`,
      { contentType: ct }
    );

    await new Promise<void>((resolve, reject) => {
      uploadStream.on('finish', () => resolve());
      uploadStream.on('error', reject);
      uploadStream.end(buffer);
    });

    // Update movie with poster info
    movie.posterStorageId = uploadStream.id.toString();
    movie.customPosterUrl = `/api/movies/${req.params.id}/poster?v=${Date.now()}`;
    movie.posterContentType = ct;
    movie.posterSize = buffer.length;
    movie.posterUpdatedAt = new Date();
    await movie.save();

    res.json({
      success: true,
      movie,
      posterUrl: movie.customPosterUrl,
      message: 'Poster uploaded successfully',
    });
  } catch (err: any) {
    console.error('[POSTER UPLOAD]', err.message);
    res.status(500).json({ error: err.message || 'Poster upload failed' });
  }
});

// ============================================================
// SETTINGS
// ============================================================
app.get('/api/admin/settings', requireAdmin, async (_req, res) => {
  try {
    await connectDB();
    const settings = await SettingsModel.findOne({ key: 'global' }).lean();
    res.json({ settings, database: { connected: mongoose.connection.readyState === 1 } });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to load settings' });
  }
});

app.put('/api/admin/settings', requireAdmin, async (req, res) => {
  try {
    await connectDB();
    const settings = await SettingsModel.findOneAndUpdate(
      { key: 'global' },
      { ...req.body, key: 'global' },
      { upsert: true, new: true }
    );
    res.json({ success: true, settings });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

// ============================================================
// DB STATUS / ORDERS / STUBS
// ============================================================
app.get('/api/admin/db/status', requireAdmin, (_req, res) => {
  res.json({
    success: true,
    dbStatus: {
      connected: mongoose.connection.readyState === 1,
      name: mongoose.connection.name,
    },
  });
});

app.get('/api/admin/orders', requireAdmin, (_req, res) => {
  res.json({ orders: [], count: 0 });
});

app.post('/api/admin/orders/verify-payments', requireAdmin, (_req, res) => {
  res.json({
    success: true,
    scannedEmailsCount: 0,
    ordersVerifiedCount: 0,
    ordersNeedsReviewCount: 0,
    duplicatesRejectedCount: 0,
    details: [],
    durationMs: 0,
  });
});

// ============================================================
// 404 + ERROR HANDLER
// ============================================================
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: `Not found: ${req.method} ${req.originalUrl}` });
});

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[GLOBAL ERROR]', err);
  res.status(err.status || 500).json({ error: err.message || 'Server error' });
});

export default app;
