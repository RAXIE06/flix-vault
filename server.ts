import express from 'express';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDatabase } from './server/db';
import { publicRouter } from './server/routes/public';
import { adminRouter } from './server/routes/admin';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || '3000', 10);

  // Connect to MongoDB Atlas (with graceful memory fallback)
  await initDatabase();

  // Core Middleware
  app.use(express.json({ limit: '10mb' }));
  app.use(cookieParser());

  // API Routes (Mount admin router before public router)
  app.use('/api/admin', adminRouter);
  app.use('/api', publicRouter);

  // Explicit 404 JSON handler for all /api/* requests: Never fall through to Vite SPA HTML
  app.all('/api/*', (req, res) => {
    res.status(404).json({
      error: `API endpoint not found: ${req.method} ${req.originalUrl}`,
      code: 'NOT_FOUND',
    });
  });

  // Error Handling Middleware (Always return JSON)
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('Unhandled server error:', err);
    res.status(500).json({
      error: 'Internal server error occurred.',
      message: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  });

  // Vite Middleware in Development / Static Serving in Production
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 [FlixVault] Full-stack server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal startup error in FlixVault server:', err);
  process.exit(1);
});
