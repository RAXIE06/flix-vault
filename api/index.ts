// api/index.ts — Full Backend (MongoDB + Telegram + Gmail IMAP + Auto-Verify + Cron)
import express from 'express';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import crypto from 'crypto';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

dotenv.config();

// ============================================================
// MONGODB CONNECTION (Cached for serverless with retry)
// ============================================================
let cached = (global as any).mongoose;
if (!cached) {
  cached = (global as any).mongoose = { conn: null, promise: null };
}

async function connectDB() {
  if (cached.conn && mongoose.connection.readyState === 1) {
    return cached.conn;
  }

  if (cached.promise) {
    try {
      cached.conn = await cached.promise;
      if (mongoose.connection.readyState === 1) return cached.conn;
      cached.promise = null;
    } catch {
      cached.promise = null;
      cached.conn = null;
    }
  }

  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) throw new Error('MONGODB_URI not set');

  cached.promise = mongoose.connect(MONGODB_URI, {
    bufferCommands: false,
    maxPoolSize: 5,
    minPoolSize: 1,
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 10000,
    family: 4,
    retryWrites: true,
    retryReads: true,
  });

  try {
    cached.conn = await cached.promise;
    console.log('[DB] MongoDB connected:', mongoose.connection.name);
    return cached.conn;
  } catch (e: any) {
    cached.promise = null;
    cached.conn = null;
    console.error('[DB] Connection failed:', e.message);
    throw e;
  }
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
  languages: [String],
  posterAspectRatio: String,
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
  telegramInviteLink: String,
  telegramInviteGeneratedAt: Date,
  telegramDeliveredAt: Date,
}, { timestamps: true, strict: false });

const OrderModel = mongoose.models.Order || mongoose.model('Order', OrderSchema);

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
// TELEGRAM ONE-TIME INVITE LINK GENERATOR
// ============================================================
async function generateTelegramInviteLink(
  channelId: string,
  orderId: string
): Promise<string | null> {
  try {
    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    if (!BOT_TOKEN) {
      console.error('[TELEGRAM] TELEGRAM_BOT_TOKEN not configured');
      return null;
    }

    if (!channelId) {
      console.error('[TELEGRAM] Channel ID is empty');
      return null;
    }

    let chatId = channelId.trim();
    if (!chatId.startsWith('@') && !chatId.startsWith('-')) {
      chatId = '@' + chatId;
    }

    const response = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/createChatInviteLink`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          member_limit: 1,
          name: `Order ${orderId}`,
        }),
      }
    );

    const data: any = await response.json();

    if (!data.ok) {
      console.error('[TELEGRAM] API error:', data.description);
      return null;
    }

    console.log('[TELEGRAM] One-time link created for', orderId, ':', data.result.invite_link);
    return data.result.invite_link;
  } catch (err: any) {
    console.error('[TELEGRAM] Invite generation failed:', err.message);
    return null;
  }
}

// ============================================================
// GMAIL IMAP — FamApp Payment Verification
// ============================================================
interface FamAppParsedAlert {
  isValid: boolean;
  amount?: number;
  utr?: string;
  fampayTxnId?: string;
  sender?: string;
  receivedAt?: Date;
  detectionReason?: string;
}

function getGmailConfig() {
  return {
    user: process.env.GMAIL_USER || '',
    appPassword: process.env.GMAIL_APP_PASSWORD || '',
    host: process.env.GMAIL_IMAP_HOST || 'imap.gmail.com',
    port: parseInt(process.env.GMAIL_IMAP_PORT || '993', 10),
    verifiedSender: process.env.GMAIL_VERIFIED_SENDER || 'no-reply@famapp.in',
  };
}

function isGmailConfigured(): boolean {
  const c = getGmailConfig();
  return !!(c.user && c.appPassword);
}

function parseFamAppEmail(from: string, subject: string, text: string): FamAppParsedAlert {
  const config = getGmailConfig();
  const result: FamAppParsedAlert = { isValid: false, sender: from };

  const senderLower = (from || '').toLowerCase();
  const verifiedLower = config.verifiedSender.toLowerCase();
  if (!senderLower.includes(verifiedLower)) {
    result.detectionReason = `Sender mismatch: ${from}`;
    return result;
  }

  const body = text || '';

  const amountPatterns = [
    /₹\s*([\d,]+\.?\d*)/,
    /Rs\.?\s*([\d,]+\.?\d*)/i,
    /INR\s*([\d,]+\.?\d*)/i,
  ];
  let amount: number | undefined;
  for (const p of amountPatterns) {
    const m = body.match(p);
    if (m) {
      amount = parseFloat(m[1].replace(/,/g, ''));
      if (!isNaN(amount)) break;
    }
  }
  if (!amount) {
    result.detectionReason = 'Amount not found';
    return result;
  }
  result.amount = amount;

  const utrMatch = body.match(/UTR[:\s]*(\d{12})/i) || body.match(/\b(\d{12})\b/);
  if (utrMatch) result.utr = utrMatch[1];

  const txnMatch = body.match(/transaction\s*id[:\s]*([A-Z0-9]+)/i) || body.match(/\b(FMP[A-Z0-9]+)\b/i);
  if (txnMatch) result.fampayTxnId = txnMatch[1];

  const successKeywords = ['received', 'success', 'credited'];
  const hasSuccess = successKeywords.some(
    (k) => body.toLowerCase().includes(k) || subject.toLowerCase().includes(k)
  );
  if (!hasSuccess) {
    result.detectionReason = 'No success keyword';
    return result;
  }

  result.isValid = true;
  return result;
}

async function fetchRecentEmails(limit: number = 20) {
  const config = getGmailConfig();
  if (!isGmailConfigured()) {
    throw new Error('Gmail not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD.');
  }

  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: true,
    auth: { user: config.user, pass: config.appPassword },
    logger: false,
  } as any);

  const emails: any[] = [];

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      const total = (client.mailbox as any)?.exists || 0;
      const start = Math.max(1, total - limit + 1);
      for await (const msg of client.fetch(`${start}:*`, { source: true })) {
        try {
          const parsed = await simpleParser((msg as any).source);
          emails.push({
            from: parsed.from?.text || '',
            subject: parsed.subject || '',
            text: parsed.text || '',
            date: parsed.date || new Date(),
            uid: (msg as any).uid,
          });
        } catch (e) { /* skip bad email */ }
      }
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (err: any) {
    try { await client.logout(); } catch {}
    throw err;
  }

  return emails.reverse();
}

async function testGmailImapConnection() {
  const start = Date.now();
  const config = getGmailConfig();

  if (!isGmailConfigured()) {
    return {
      success: false,
      message: 'Gmail not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD.',
      durationMs: Date.now() - start,
    };
  }

  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: true,
    auth: { user: config.user, pass: config.appPassword },
    logger: false,
  } as any);

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    const exists = (client.mailbox as any)?.exists || 0;
    lock.release();
    await client.logout();
    return {
      success: true,
      message: `Connected to ${config.user}. INBOX has ${exists} messages.`,
      durationMs: Date.now() - start,
    };
  } catch (err: any) {
    try { await client.logout(); } catch {}
    return {
      success: false,
      message: 'IMAP connection failed',
      error: err.message,
      durationMs: Date.now() - start,
    };
  }
}

async function runPaymentVerificationScan(limit: number = 20) {
  const start = Date.now();
  const details: any[] = [];
  let ordersVerifiedCount = 0;
  let ordersNeedsReviewCount = 0;
  let duplicatesRejectedCount = 0;

  try {
    // 🔥 CRITICAL: Ensure DB is connected before querying
    await connectDB();

    if (!isGmailConfigured()) {
      return {
        success: false,
        scannedEmailsCount: 0,
        ordersVerifiedCount: 0,
        ordersNeedsReviewCount: 0,
        duplicatesRejectedCount: 0,
        details: [],
        durationMs: Date.now() - start,
        error: 'Gmail not configured',
      };
    }

    const emails = await fetchRecentEmails(limit);

    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
    const pendingOrders = await OrderModel.find({
      status: 'pending',
      createdAt: { $gte: thirtyMinAgo },
    }).sort({ createdAt: -1 });

    const usedUtrs = new Set(
      (await OrderModel.find({ matchedUtr: { $exists: true, $ne: '' } }).lean())
        .map((o: any) => o.matchedUtr)
        .filter(Boolean)
    );

    for (const email of emails) {
      const parsed = parseFamAppEmail(email.from, email.subject, email.text);

      if (!parsed.isValid || !parsed.amount) {
        details.push({ emailSubject: email.subject, status: 'skipped', reason: parsed.detectionReason || 'Invalid' });
        continue;
      }

      if (parsed.utr && usedUtrs.has(parsed.utr)) {
        duplicatesRejectedCount++;
        details.push({ emailSubject: email.subject, status: 'duplicate', reason: `UTR ${parsed.utr} reused` });
        continue;
      }

      let matchedOrder: any = null;
      for (const order of pendingOrders) {
        if (Math.abs(order.payableAmount - parsed.amount) < 0.01) {
          matchedOrder = order;
          break;
        }
      }

      if (!matchedOrder) {
        ordersNeedsReviewCount++;
        details.push({ emailSubject: email.subject, status: 'no_match', amount: parsed.amount, utr: parsed.utr });
        continue;
      }

      matchedOrder.status = 'verified';
      matchedOrder.verifiedAt = new Date();
      matchedOrder.matchedUtr = parsed.utr || 'AUTO-VERIFIED';
      matchedOrder.maskedUtr = matchedOrder.matchedUtr.slice(0, 4) + '****' + matchedOrder.matchedUtr.slice(-4);
      matchedOrder.fampayTxnId = parsed.fampayTxnId || '';
      matchedOrder.matchedAmountRupees = parsed.amount;
      matchedOrder.matchedAmountPaise = Math.round(parsed.amount * 100);
      matchedOrder.verificationReason = `Auto-verified via FamApp email`;

      if (!matchedOrder.telegramInviteLink) {
        const movie = await MovieModel.findOne({ id: matchedOrder.movieId }).lean();
        if (movie?.telegramChannelId) {
          const link = await generateTelegramInviteLink(movie.telegramChannelId, matchedOrder.orderId);
          if (link) {
            matchedOrder.telegramInviteLink = link;
            matchedOrder.telegramInviteGeneratedAt = new Date();
          }
        }
      }

      await matchedOrder.save();
      if (parsed.utr) usedUtrs.add(parsed.utr);
      ordersVerifiedCount++;
      details.push({ emailSubject: email.subject, status: 'verified', orderId: matchedOrder.orderId, amount: parsed.amount });
    }

    return {
      success: true,
      scannedEmailsCount: emails.length,
      ordersVerifiedCount,
      ordersNeedsReviewCount,
      duplicatesRejectedCount,
      details,
      durationMs: Date.now() - start,
    };
  } catch (err: any) {
    console.error('[PAYMENT SCAN ERROR]', err.message);
    return {
      success: false,
      scannedEmailsCount: 0,
      ordersVerifiedCount,
      ordersNeedsReviewCount,
      duplicatesRejectedCount,
      details,
      durationMs: Date.now() - start,
      error: err.message,
    };
  }
}

// ============================================================
// AUTO-VERIFY: Background Payment Scan Trigger
// ============================================================
let lastGlobalScan = 0;
const GLOBAL_SCAN_THROTTLE_MS = 25 * 1000;

function triggerBackgroundVerify() {
  const now = Date.now();
  if (now - lastGlobalScan < GLOBAL_SCAN_THROTTLE_MS) {
    return;
  }
  lastGlobalScan = now;

  // 🔥 connectDB() is called inside runPaymentVerificationScan now
  runPaymentVerificationScan(30)
    .then((result) => {
      if (result.ordersVerifiedCount > 0) {
        console.log(`[AUTO-VERIFY] Auto-verified ${result.ordersVerifiedCount} order(s)`);
      }
    })
    .catch((err) => {
      console.error('[AUTO-VERIFY] Background scan failed:', err?.message || err);
    });
}

// ============================================================
// HEALTH
// ============================================================
app.get('/api/health', async (_req, res) => {
  if (mongoose.connection.readyState !== 1) {
    try {
      await Promise.race([
        connectDB(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 6000)),
      ]);
    } catch {}
  }

  res.json({
    status: 'ok',
    database: {
      connected: mongoose.connection.readyState === 1,
      name: mongoose.connection.name || null,
      readyState: mongoose.connection.readyState,
    },
    telegram: {
      botConfigured: !!process.env.TELEGRAM_BOT_TOKEN,
    },
    gmail: {
      configured: isGmailConfigured(),
    },
    cron: {
      configured: !!process.env.CRON_SECRET,
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

// ============================================================
// LANGUAGES — Available options
// ============================================================
const AVAILABLE_LANGUAGES = [
  'Hindi', 'English', 'Tamil', 'Telugu', 'Malayalam', 'Kannada',
  'Bengali', 'Marathi', 'Punjabi', 'Gujarati', 'Bhojpuri', 'Urdu',
];

const AVAILABLE_ASPECT_RATIOS = [
  { value: '2:3', label: '2:3 — Classic Movie Poster (Vertical)' },
  { value: '16:9', label: '16:9 — Cinematic Widescreen' },
  { value: '1:1', label: '1:1 — Square (Instagram Style)' },
  { value: '4:5', label: '4:5 — Portrait (Mobile Optimized)' },
];

app.get('/api/languages', (_req, res) => {
  res.json({
    languages: AVAILABLE_LANGUAGES,
    aspectRatios: AVAILABLE_ASPECT_RATIOS,
  });
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
// ORDER ROUTES (with Auto-Verify trigger)
// ============================================================
app.post('/api/orders/create', async (req, res) => {
  try {
    await connectDB();
    const { movieId } = req.body || {};
    if (!movieId) return res.status(400).json({ error: 'movieId is required' });

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

    const discountRupees = Math.round((0.01 + Math.random() * 0.99) * 100) / 100;
    const basePrice = movie.priceNumeric || 149;
    const payableAmount = Math.round((basePrice - discountRupees) * 100) / 100;

    const orderId = `FLX-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    const amountStr = payableAmount.toFixed(2);
    const upiString = `upi://pay?pa=${encodeURIComponent(upiVpa)}&pn=${encodeURIComponent(payeeName)}&am=${amountStr}&cu=INR&tn=${encodeURIComponent(orderId)}`;

    let telegramInviteLink: string | undefined;
    if (movie.telegramChannelId) {
      const link = await generateTelegramInviteLink(movie.telegramChannelId, orderId);
      if (link) {
        telegramInviteLink = link;
        console.log('[ORDER] Telegram link pre-generated for', orderId);
      }
    }

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
      telegramInviteLink,
      telegramInviteGeneratedAt: telegramInviteLink ? new Date() : undefined,
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

    const orderObj: any = order.toObject();
    orderObj.upiPaymentUri = orderObj.upiPaymentUri || orderObj.qrString;
    orderObj.upiPayeeName = orderObj.upiPayeeName || orderObj.payeeName;

    if (orderObj.status !== 'verified') {
      delete orderObj.telegramInviteLink;
    }

    // 🔥 AUTO-VERIFY: If order is still pending, trigger background Gmail scan
    if (orderObj.status === 'pending') {
      triggerBackgroundVerify();
    }

    res.json(orderObj);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to load order' });
  }
});

// ============================================================
// EXTERNAL CRON ENDPOINT — Auto Verify (from cron-job.org)
// ============================================================
app.all('/api/cron/verify-payments', async (req, res) => {
  const secretFromQuery = req.query.secret;
  const secretFromHeader = req.headers['x-cron-secret'];
  const providedSecret = secretFromQuery || secretFromHeader;
  const expectedSecret = process.env.CRON_SECRET;

  if (!expectedSecret) {
    return res.status(500).json({ error: 'CRON_SECRET not configured on server' });
  }

  if (providedSecret !== expectedSecret) {
    return res.status(401).json({ error: 'Unauthorized — invalid cron secret' });
  }

  try {
    console.log('[CRON] Triggered by external service');
    // runPaymentVerificationScan now awaits connectDB() internally
    const result = await runPaymentVerificationScan(30);
    res.json({
      success: true,
      ...result,
      triggeredBy: 'external-cron',
      triggeredAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[CRON] Verify failed:', err.message);
    res.status(500).json({
      success: false,
      error: err.message,
      triggeredBy: 'external-cron',
    });
  }
});

app.get('/api/cron/ping', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
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
// POSTER UPLOAD
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
        rating: 'U/A 13+',
        director: '',
        priceSample: '₹149',
        priceNumeric: 149,
        resolution: '4K IMAX',
        audio: 'Dolby Atmos',
        languages: [],
        posterAspectRatio: '2:3',
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
      o.upiPaymentUri = o.upiPaymentUri || o.qrString;
      o.upiPayeeName = o.upiPayeeName || o.payeeName;
      return o;
    });

    res.json({ orders: sanitized, count: sanitized.length });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to load orders' });
  }
});

app.post('/api/admin/orders/:orderId/verify-manual', requireAdmin, async (req, res) => {
  try {
    await connectDB();
    const { orderId } = req.params;
    const order = await OrderModel.findOne({ orderId });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    order.status = 'verified';
    order.verifiedAt = new Date();
    order.verificationReason = 'Manually verified by admin';
    order.matchedUtr = req.body?.utr || 'MANUAL-ADMIN';
    order.maskedUtr = order.matchedUtr.slice(0, 4) + '****' + order.matchedUtr.slice(-4);

    if (!order.telegramInviteLink) {
      const movie = await MovieModel.findOne({ id: order.movieId }).lean();
      if (movie?.telegramChannelId) {
        const link = await generateTelegramInviteLink(movie.telegramChannelId, orderId);
        if (link) {
          order.telegramInviteLink = link;
          order.telegramInviteGeneratedAt = new Date();
        }
      }
    }

    await order.save();

    res.json({
      success: true,
      order: {
        ...order.toObject(),
        upiPaymentUri: order.qrString,
        upiPayeeName: order.payeeName,
      },
    });
  } catch (err: any) {
    console.error('[MANUAL VERIFY]', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/orders/:orderId/telegram-link', requireAdmin, async (req, res) => {
  try {
    await connectDB();
    const order = await OrderModel.findOne({ orderId: req.params.orderId }).lean();
    if (!order) return res.status(404).json({ error: 'Order not found' });

    res.json({
      success: true,
      orderId: order.orderId,
      status: order.status,
      telegramInviteLink: (order as any).telegramInviteLink || null,
      hasLink: !!(order as any).telegramInviteLink,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/orders/:orderId/generate-telegram-link', requireAdmin, async (req, res) => {
  try {
    await connectDB();
    const order = await OrderModel.findOne({ orderId: req.params.orderId });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    if (order.telegramInviteLink) {
      return res.json({ success: true, telegramInviteLink: order.telegramInviteLink });
    }

    const movie = await MovieModel.findOne({ id: order.movieId }).lean();
    if (!movie?.telegramChannelId) {
      return res.status(400).json({ error: 'No Telegram channel configured for this movie' });
    }

    const link = await generateTelegramInviteLink(movie.telegramChannelId, order.orderId);
    if (!link) {
      return res.status(500).json({ error: 'Telegram API failed. Check TELEGRAM_BOT_TOKEN and bot admin permissions.' });
    }

    order.telegramInviteLink = link;
    order.telegramInviteGeneratedAt = new Date();
    await order.save();

    res.json({ success: true, telegramInviteLink: link });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// MANUAL PAYMENT VERIFICATION (from admin panel button)
// ============================================================
app.post('/api/admin/orders/verify-payments', requireAdmin, async (req, res) => {
  try {
    const limit = parseInt(req.body?.limit || '20', 10);
    const result = await runPaymentVerificationScan(limit);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err.message,
      scannedEmailsCount: 0,
      ordersVerifiedCount: 0,
      ordersNeedsReviewCount: 0,
      duplicatesRejectedCount: 0,
      details: [],
      durationMs: 0,
    });
  }
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
// GMAIL ROUTES
// ============================================================
app.get('/api/admin/gmail/status', requireAdmin, (_req, res) => {
  const config = getGmailConfig();
  res.json({
    configured: isGmailConfigured(),
    user: config.user ? config.user.slice(0, 3) + '***@' + config.user.split('@')[1] : null,
    host: config.host,
    port: config.port,
    verifiedSender: config.verifiedSender,
    message: isGmailConfigured() ? 'Gmail IMAP configured.' : 'Set GMAIL_USER and GMAIL_APP_PASSWORD.',
  });
});

app.post('/api/admin/gmail/test-connection', requireAdmin, async (_req, res) => {
  try {
    const result = await testGmailImapConnection();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: 'Unexpected error',
      error: err.message,
      durationMs: 0,
    });
  }
});

app.get('/api/admin/gmail/recent-alerts', requireAdmin, async (req, res) => {
  try {
    const limit = parseInt((req.query.limit as string) || '10', 10);

    if (!isGmailConfigured()) {
      return res.json({
        success: false,
        count: 0,
        emails: [],
        error: 'Gmail not configured',
      });
    }

    const emails = await fetchRecentEmails(limit);
    const summaries = emails.map((e: any) => ({
      from: e.from,
      subject: e.subject,
      date: e.date,
      preview: (e.text || '').slice(0, 120),
    }));

    res.json({ success: true, count: summaries.length, emails: summaries });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      count: 0,
      emails: [],
      error: err.message,
    });
  }
});

app.post('/api/admin/gmail/diagnose-parser', requireAdmin, (req, res) => {
  try {
    const { from, subject, text } = req.body || {};
    if (!from && !subject && !text) {
      return res.status(400).json({ error: 'Provide at least one field: from, subject, or text' });
    }

    const result = parseFamAppEmail(from || '', subject || '', text || '');
    res.json({ success: true, result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// DB STATUS
// ============================================================
app.get('/api/admin/db/status', requireAdmin, async (_req, res) => {
  if (mongoose.connection.readyState !== 1) {
    try {
      await Promise.race([
        connectDB(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
      ]);
    } catch { /* ignore */ }
  }

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
