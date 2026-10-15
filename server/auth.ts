import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';

const SESSION_COOKIE_NAME = 'flixvault_admin_session';
const SESSION_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

// Session secret key from environment
function getSessionSecret(): string {
  return process.env.SESSION_SECRET || 'flixvault_default_secret_key_change_in_production';
}

// Configured admin access code
export function getAdminAccessCode(): string {
  const envCode = process.env.ADMIN_ACCESS_CODE?.trim();
  return envCode || 'flixvault_admin_2026';
}

// Create a cryptographically signed session token
export function createSessionToken(): string {
  const payload = {
    role: 'admin',
    iat: Date.now(),
    exp: Date.now() + SESSION_EXPIRY_MS,
    nonce: crypto.randomBytes(8).toString('hex'),
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', getSessionSecret())
    .update(payloadB64)
    .digest('base64url');

  return `${payloadB64}.${signature}`;
}

// Verify a session token
export function verifySessionToken(token: string): boolean {
  if (!token || !token.includes('.')) return false;

  const [payloadB64, signature] = token.split('.');
  if (!payloadB64 || !signature) return false;

  const expectedSignature = crypto
    .createHmac('sha256', getSessionSecret())
    .update(payloadB64)
    .digest('base64url');

  // Constant-time comparison
  const signatureValid =
    signature.length === expectedSignature.length &&
    crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));

  if (!signatureValid) return false;

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (payload.role !== 'admin') return false;
    if (Date.now() > payload.exp) return false;
    return true;
  } catch {
    return false;
  }
}

// Express Rate Limiter for Login Attempts
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 60, // Resilient threshold allowing legitimate admin workflow and test suites
  skip: () => process.env.NODE_ENV === 'test',
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many authentication attempts. Please wait 15 minutes before retrying.',
    code: 'RATE_LIMITED',
  },
});

// Middleware to enforce Admin Authentication on protected routes
export function requireAdminAuth(req: Request, res: Response, next: NextFunction): void {
  // Check HttpOnly cookie first, then Authorization header fallback
  const token =
    req.cookies?.[SESSION_COOKIE_NAME] ||
    req.headers.authorization?.replace(/^Bearer\s+/i, '');

  if (!token || !verifySessionToken(token)) {
    res.status(401).json({
      error: 'Unauthorized: Admin authentication required to access this endpoint.',
      code: 'AUTH_REQUIRED',
    });
    return;
  }

  next();
}

// Helper to set the secure HttpOnly cookie
export function setAdminSessionCookie(res: Response, token: string, req?: Request): void {
  const isHttps =
    req?.secure ||
    req?.headers?.['x-forwarded-proto'] === 'https' ||
    process.env.NODE_ENV === 'production';

  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: Boolean(isHttps),
    sameSite: isHttps ? 'none' : 'lax',
    maxAge: SESSION_EXPIRY_MS,
    path: '/',
  });
}

// Helper to clear the session cookie
export function clearAdminSessionCookie(res: Response, req?: Request): void {
  const isHttps =
    req?.secure ||
    req?.headers?.['x-forwarded-proto'] === 'https' ||
    process.env.NODE_ENV === 'production';

  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: Boolean(isHttps),
    sameSite: isHttps ? 'none' : 'lax',
    path: '/',
  });
}

