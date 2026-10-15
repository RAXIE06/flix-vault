// api/index.ts — Vercel Serverless Entry Point
import express from 'express';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { initDatabase } from '../server/db';
import { publicRouter } from '../server/routes/public';
import { adminRouter } from '../server/routes/admin';

dotenv.config();

// ============================================================
// FIRE-AND-FORGET DB CONNECTION
// Don't block requests — MongoDB background mein connect hoga
// ============================================================
let dbConnectAttempted = false;

function tryConnectDB() {
  if (dbConnectAttempted) return;
  dbConnectAttempted = true;

  initDatabase()
    .then((ok) => {
      console.log('[DB] Background init result:', ok);
    })
    .catch((err) => {
      console.error('[DB] Background init failed:', err?.message || err);
      // Reset so next cold start retries
      dbConnectAttempted = false;
    });
}

// Trigger connection on module load (cold start)
tryConnectDB();

// ============================================================
// EXPRESS APP
// ============================================================
const app = express();

// CORS — Vercel cross-domain cookies ke liye
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

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// ============================================================
// HEALTH CHECK — never blocks on DB
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
// ROUTES
// ============================================================
app.use('/api/admin', adminRouter);
app.use('/api', publicRouter);

// API 404 — JSON return karega
app.all('/api/*', (req, res) => {
  res.status(404).json({
    error: `API endpoint not found: ${req.method} ${req.originalUrl}`,
    code: 'NOT_FOUND',
  });
});

// Global error handler — JSON return karega
app.use(
  (
    err: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error('[GLOBAL ERROR]', err);
    res.status(err.status || 500).json({
      error: err.message || 'Internal server error',
    });
  }
);

// Vercel serverless export
export default app;
