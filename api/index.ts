// api/index.ts — Vercel Serverless Entry Point
import express from 'express';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { initDatabase } from '../server/db.js';
import { publicRouter } from '../server/routes/public.js';
import { adminRouter } from '../server/routes/admin.js';

dotenv.config();

const app = express();

// ============================================================
// CORE MIDDLEWARE
// ============================================================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// ============================================================
// CORS — Vercel ke liye zaroori (cross-domain cookies)
// ============================================================
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});

// ============================================================
// LAZY DATABASE INIT — Cold start par ek baar hi chalta hai
// ============================================================
let dbInitPromise: Promise<any> | null = null;

app.use(async (_req, _res, next) => {
  if (!dbInitPromise) {
    dbInitPromise = initDatabase().catch((err) => {
      console.error('[DB] Init failed:', err);
      dbInitPromise = null; // Agla request par retry karega
      return null;
    });
  }
  try {
    await dbInitPromise;
  } catch {
    // Ignore — routes have memory fallback
  }
  next();
});

// ============================================================
// ROUTES (server.ts se same — order important hai)
// ============================================================
app.use('/api/admin', adminRouter);
app.use('/api', publicRouter);

// ============================================================
// API 404 — JSON return karega, HTML NAHI
// ============================================================
app.all('/api/*', (req, res) => {
  res.status(404).json({
    error: `API endpoint not found: ${req.method} ${req.originalUrl}`,
    code: 'NOT_FOUND',
  });
});

// ============================================================
// GLOBAL ERROR HANDLER — JSON return karega
// ============================================================
app.use(
  (
    err: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error('[GLOBAL ERROR]', err);
    res.status(err.status || 500).json({
      error: err.message || 'Internal server error occurred.',
    });
  }
);

// ============================================================
// VERCEL SERVERLESS EXPORT
// ============================================================
export default app;
