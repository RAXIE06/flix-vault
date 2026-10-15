// api/index.ts
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';

// ============================================================
// MongoDB Connection Cache — Vercel Serverless ke liye ZAROORI
// ============================================================
let cached = (global as any).mongoose;

if (!cached) {
  cached = (global as any).mongoose = { conn: null, promise: null };
}

async function connectDB() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const MONGODB_URI = process.env.MONGODB_URI;
    if (!MONGODB_URI) {
      throw new Error('MONGODB_URI environment variable is not set in Vercel');
    }

    console.log('[DB] Connecting to MongoDB Atlas...');
    cached.promise = mongoose.connect(MONGODB_URI, {
      bufferCommands: false,
      maxPoolSize: 5,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });
  }

  try {
    cached.conn = await cached.promise;
    console.log('[DB] MongoDB connected:', mongoose.connection.name);
  } catch (e) {
    cached.promise = null;
    console.error('[DB] Connection failed:', e);
    throw e;
  }

  return cached.conn;
}

// ============================================================
// Express App
// ============================================================
const app = express();

app.use(cors({
  origin: true,
  credentials: true,
}));

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// ============================================================
// DB Connection Middleware — har request se pehle
// ============================================================
app.use(async (req, res, next) => {
  // Health check ko DB ke bina bhi chalne do
  if (req.path === '/api/health') {
    return next();
  }

  try {
    await connectDB();
    next();
  } catch (err: any) {
    console.error('[DB MIDDLEWARE ERROR]', err);
    res.status(500).json({
      error: 'Database connection failed',
      details: err.message,
    });
  }
});

// ============================================================
// 🚨 YAHAN APNE SAARE ROUTES PASTE KARO (server.ts se)
// ============================================================
// Example structure — tumhare actual routes yahan aayenge:

// import authRoutes from './routes/auth';
// app.use('/api/auth', authRoutes);

// import movieRoutes from './routes/movies';
// app.use('/api', movieRoutes);

// import orderRoutes from './routes/orders';
// app.use('/api/orders', orderRoutes);

// import adminRoutes from './routes/admin';
// app.use('/api/admin', adminRoutes);

// ... etc

// ============================================================
// Health Check
// ============================================================
app.get('/api/health', (req, res) => {
  const connected = mongoose.connection.readyState === 1;
  res.json({
    status: 'ok',
    database: {
      connected,
      name: mongoose.connection.name || null,
      host: mongoose.connection.host || null,
    },
    paymentMode: process.env.PAYMENT_MODE || 'upi',
    timestamp: new Date().toISOString(),
  });
});

// ============================================================
// API 404 — HTML nahi, JSON return karega
// ============================================================
app.use('/api', (req, res) => {
  res.status(404).json({
    error: `API route not found: ${req.method} ${req.originalUrl}`,
  });
});

// ============================================================
// Global Error Handler
// ============================================================
app.use((
  err: any,
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  console.error('[GLOBAL ERROR]', err);

  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'File too large (max 25MB)' });
  }
  if (err.name === 'MulterError') {
    return res.status(400).json({ error: `Upload error: ${err.code}` });
  }

  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

// ============================================================
// Vercel Serverless Export (app.listen NAHI karna)
// ============================================================
export default app;
