// Minimal admin auth — NO mongoose, NO database, NO crash possible
import express from 'express';
import cookieParser from 'cookie-parser';
import crypto from 'crypto';

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

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
  } catch {
    return false;
  }
}

// ==================== ADMIN AUTH ====================
app.post('/api/auth/login', (req, res) => {
  const { accessCode } = req.body || {};
  console.log('[LOGIN] Attempt received');
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
  const token =
    req.cookies?.[SESSION_COOKIE] ||
    req.headers.authorization?.replace(/^Bearer\s+/i, '');
  res.json({ authenticated: verifyToken(token) });
});

app.post('/api/auth/logout', (_req, res) => {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.json({ success: true });
});

// ==================== STUBS (no DB needed) ====================
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', mode: 'standalone', timestamp: new Date().toISOString() });
});

app.get('/api/movies', (_req, res) => {
  res.json({ movies: [], storage: 'local-fallback' });
});

app.get('/api/settings', (_req, res) => {
  res.json({ featuredMovieId: '', storefrontMaxTitles: 5 });
});

app.get('/api/admin/movies', (_req, res) => {
  res.json({ movies: [], storage: 'local-fallback' });
});

app.get('/api/admin/settings', (_req, res) => {
  res.json({ settings: {}, database: { connected: false } });
});

app.get('/api/admin/orders', (_req, res) => {
  res.json({ orders: [], count: 0 });
});

app.get('/api/admin/db/status', (_req, res) => {
  res.json({ success: true, dbStatus: { connected: false, fallback: true } });
});

// ==================== 404 ====================
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: `Not found: ${req.method} ${req.originalUrl}` });
});

export default app;
