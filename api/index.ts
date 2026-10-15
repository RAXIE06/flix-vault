// api/index.ts — Full Backend (MongoDB + All Routes)
import express from 'express';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import crypto from 'crypto';

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

connectDB().catch((e) => console.error('[DB] Initial connect failed:', e.message));

// ============================================================
// EXPRESS APP
// ============================================================
const app = express();

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
// MODELS
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

const OrderSchema = new mongoose.Schema({
  orderId: { type: String, required: true, unique: true, index: true },
  movieId: String,
  movieTitle: String,
  originalPrice: Number,
  payableAmount: Number,
  discountAmount: Number,
  status: { type: String, default: 'pending' },
  expiresAt: Date,
  matchedUtr: String,
  maskedUtr: String,
  fampayTxnId: String,
  verifiedAt: Date,
  verificationReason: String,
  matchedAmountPaise: Number,
  matchedAmountRupees: Number,
  userUtr: String,
  upiVpa: String,
  payeeName: String,
  qrString: String,
  upiPaymentUri: String,
  upiPayeeName: String,
}, { timestamps: true, strict: false });

const OrderModel = mongoose.models.Order || mongoose.model('Order', OrderSchema);

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
// ORDER ROUTES (Pay-Per-Movie UPI)
// ============================================================
app.post('/api/orders/create', async (req, res) => {
  try {
    await connectDB();
    const { movieId } = req.body || {};
    if (!movieId) return res.status(400).json({ error: 'movieId is required' });

    // Try DB first, fallback to any movie with this id
    let movie = await MovieModel.findOne({ id: movieId }).lean();
    if (!movie) {
      const anyMovie = await MovieModel.findOne({}).lean();
      if (!anyMovie) {
        return res.status(404).json({ error: 'Movie not found in database' });
      }
      return res.status(404).json({ error: `Movie ${movieId} not found. Please save movies from admin panel first.` });
    }

    const settings = await SettingsModel.findOne({ key: 'global' }).lean();
    const upiVpa = settings?.upiConfig?.upiVpa || process.env.UPI_VPA || 'flixvault@upi';
    const payeeName = settings?.upiConfig?.payeeName || 'FlixVault Cinema';

    // Random discount: ₹0.01 to ₹1.00
    const discountRupees = Math.round((0.01 + Math.random() * 0.99) * 100) / 100;
    const basePrice = movie.priceNumeric || 149;
    const payableAmount = Math.round((basePrice - discountRupees) * 100) / 100;

    const orderId = `FLX-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    const amountStr = payableAmount.toFixed(2);
    const upiString = `upi://pay?pa=${encodeURIComponent(upiVpa)}&pn=${encodeURIComponent(payeeName)}&am=${amountStr}&cu=INR&tn=${encodeURIComponent(orderId)}`;

    const order = new OrderModel({
      orderId,
      movieId: movie.id,
      movieTitle: movie.title,
      originalPrice: basePrice,
      payableAmount,
      discountAmount: discountRupees,
      status: 'pending',
      expiresAt,
      upiVpa,
      payeeName,
      qrString: upiString,
      upiPaymentUri: upiString,
      upiPayeeName: payeeName,
    });
    await order.save();

    res.json({ success: true, order });
  } catch (err: any) {
    console.error('[ORDER CREATE]', err.message);
    res.status(500).json({ error: err.message || 'Failed to create order' });
  }
});

app.get('/api/orders/:orderId', async (req, res) => {
  try {
    await connectDB();
    const order = await OrderModel.findOne({ orderId: req.params.orderId });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    if (order.status === 'pending' && order.expiresAt && new Date(order.expiresAt) < new Date()) {
      order.status = 'expired';
      await order.save();
    }

    // Normalize field names for frontend compatibility
    const orderObj: any = order.toObject();
    orderObj.upiPaymentUri = orderObj.upiPaymentUri || orderObj.qrString;
    orderObj.upiPayeeName = orderObj.upiPayeeName || orderObj.payeeName;

    res.json(orderObj);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to load order' });
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
// ADMIN MOVIES
// ============================================================
app.get('/api/admin/movies', requireAdmin, async (_req, res) => {
  try {
    await connectDB();
    const movies = await MovieModel.find({}).sort({ isFeatured: -1, createdAt: -1 }).lean();
    res.json({ movies, storage: 'mongodb' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to load admin movies' });
  }
});

app.post('/api/admin/movies', requireAdmin, async (req, res) => {
  try {
    await connectDB();
    const data = req.body;
    if (!data.title?.trim()) return res.status(400).json({ error: 'Title required' });
    if (!data.synopsis?.trim()) return res.status(400).json({ error: 'Synopsis required' });

    const id = data.id || `mv-${Date.now().toString().slice(-6)}`;

    const movie = await MovieModel.findOneAndUpdate(
      { id },
      { ...data, id },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.status(201).json({ success: true, movie });
  } catch (err: any) {
    console.error('[CREATE MOVIE]', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/movies/:id', requireAdmin, async (req, res) => {
  try {
    await connectDB();
    const movie = await MovieModel.findOneAndUpdate(
      { id: req.params.id },
      { ...req.body, id: req.params.id },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    res.json({ success: true, movie });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

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
// POSTER UPLOAD (Base64) — Auto-creates movie if not found
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

    let movie = await MovieModel.findOne({ id: req.params.id });
    if (!movie) {
      console.log(`[POSTER] Auto-creating movie: ${req.params.id}`);
      movie = new MovieModel({
        id: req.params.id,
        title: req.params.id,
        synopsis: 'Auto-created on poster upload.',
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

    if (movie.posterStorageId) {
      try {
        const bucket = getBucket();
        await bucket.delete(new mongoose.Types.ObjectId(movie.posterStorageId));
      } catch (e) { /* ignore */ }
    }

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

app.delete('/api/admin/movies/:id/poster', requireAdmin, async (req, res) => {
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

    movie.posterStorageId = '';
    movie.customPosterUrl = '';
    movie.posterContentType = '';
    movie.posterSize = 0;
    await movie.save();

    res.json({ success: true, movie });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// ADMIN SETTINGS
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
// ADMIN ORDERS
// ============================================================
app.get('/api/admin/orders', requireAdmin, async (_req, res) => {
  try {
    await connectDB();
    const orders = await OrderModel.find({}).sort({ createdAt: -1 }).limit(50).lean();

    const now = new Date();
    const sanitized = orders.map((o: any) => {
      if (o.status === 'pending' && o.expiresAt && new Date(o.expiresAt) < now) {
        o.status = 'expired';
      }
      // Normalize field names for frontend
      o.upiPaymentUri = o.upiPaymentUri || o.qrString;
      o.upiPayeeName = o.upiPayeeName || o.payeeName;
      return o;
    });

    res.json({ orders: sanitized, count: sanitized.length });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to load orders' });
  }
});

app.post('/api/admin/orders/verify-payments', requireAdmin, async (_req, res) => {
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
// UPI CONFIG
// ============================================================
app.get('/api/admin/upi-config', requireAdmin, async (_req, res) => {
  try {
    await connectDB();
    const settings = await SettingsModel.findOne({ key: 'global' }).lean();
    const upiConfig = settings?.upiConfig || {
      upiVpa: process.env.UPI_VPA || 'flixvault@upi',
      payeeName: 'FlixVault Cinema',
      paiseMinRange: 1,
      paiseMaxRange: 99,
    };
    res.json({ upiConfig });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to load UPI config' });
  }
});

app.put('/api/admin/upi-config', requireAdmin, async (req, res) => {
  try {
    await connectDB();
    const { upiVpa, payeeName } = req.body || {};
    if (!upiVpa || !upiVpa.includes('@')) {
      return res.status(400).json({ error: 'Valid UPI VPA required (must contain @)' });
    }

    const upiConfig = {
      upiVpa: String(upiVpa).trim(),
      payeeName: String(payeeName || 'FlixVault Cinema').trim(),
      paiseMinRange: 1,
      paiseMaxRange: 99,
    };

    const settings = await SettingsModel.findOneAndUpdate(
      { key: 'global' },
      { upiConfig, key: 'global' },
      { upsert: true, new: true }
    );

    res.json({ success: true, upiConfig: settings.upiConfig });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to save UPI config' });
  }
});

// ============================================================
// GMAIL STUBS
// ============================================================
app.get('/api/admin/gmail/status', requireAdmin, (_req, res) => {
  res.json({
    configured: false,
    verifiedSender: process.env.GMAIL_VERIFIED_SENDER || null,
    message: 'Gmail IMAP integration not configured in this deployment.',
  });
});

app.post('/api/admin/gmail/test-connection', requireAdmin, (_req, res) => {
  res.json({
    success: false,
    message: 'Gmail IMAP not available in this deployment.',
    durationMs: 0,
  });
});

// ============================================================
// DB STATUS
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

app.post('/api/admin/db/retry', requireAdmin, async (_req, res) => {
  try {
    cached.conn = null;
    cached.promise = null;
    await connectDB();
    res.json({
      success: true,
      dbStatus: {
        connected: mongoose.connection.readyState === 1,
        name: mongoose.connection.name,
      },
    });
  } catch (err: any) {
    res.json({
      success: false,
      error: err.message,
      dbStatus: { connected: false },
    });
  }
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
