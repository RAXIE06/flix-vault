import { Router, Request, Response } from 'express';
import { MovieModel } from '../models/Movie';
import { StorefrontSettingsModel } from '../models/StorefrontSettings';
import { OrderModel } from '../models/Order';
import { memoryStore, getDBStatus, DEFAULT_UPI_CONFIG } from '../db';
import {
  buildUpiPaymentUri,
  validateUpiVpa,
  resolveUpiConfig,
  maskUpiVpa,
  maskUpiUri,
} from '../upi';
import {
  getAdminAccessCode,
  createSessionToken,
  setAdminSessionCookie,
  clearAdminSessionCookie,
  verifySessionToken,
  loginRateLimiter,
  requireAdminAuth,
} from '../auth';
import multer from 'multer';
import {
  getPosterStreamFromGridFS,
  storePosterInGridFS,
  deletePosterFromGridFS,
  validateImageBuffer,
} from '../posterStorage';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

export const publicRouter = Router();

// Public: Health and Database connection status
publicRouter.get('/health', (_req: Request, res: Response) => {
  const dbStatus = getDBStatus();
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    database: dbStatus,
    paymentMode: 'UPI_ONLY',
  });
});

// Public: Fetch enabled movies for public storefront (No Auth Required)
publicRouter.get('/movies', async (_req: Request, res: Response) => {
  try {
    const dbStatus = getDBStatus();
    let movies: any[] = [];

    if (dbStatus.connected) {
      movies = await MovieModel.find({ isEnabled: { $ne: false } })
        .sort({ isFeatured: -1, createdAt: -1 })
        .lean();
    } else {
      // Memory store fallback
      movies = memoryStore.movies.filter((m: any) => m.isEnabled !== false);
    }

    // Sanitize for public audience (remove internal sensitive fields if any)
    const sanitized = movies.map((m) => ({
      id: m.id,
      title: m.title,
      tagline: m.tagline,
      synopsis: m.synopsis,
      year: m.year,
      duration: m.duration,
      rating: m.rating,
      genres: m.genres,
      priceSample: m.priceSample,
      accessType: 'pay_per_movie',
      accessLabel: `Pay per Movie · ${m.priceSample}`,
      resolution: m.resolution,
      audio: m.audio,
      director: m.director,
      cast: m.cast,
      isFeatured: !!m.isFeatured,
      isEnabled: m.isEnabled !== false,
      artwork: m.artwork,
      customPosterUrl: m.customPosterUrl,
      posterStorageId: m.posterStorageId,
      posterContentType: m.posterContentType,
      posterUpdatedAt: m.posterUpdatedAt,
    }));

    res.json({
      movies: sanitized,
      count: sanitized.length,
      storage: dbStatus.connected ? 'mongodb' : 'memory-fallback',
    });
  } catch (err: any) {
    console.error('Error fetching public movies:', err);
    res.status(500).json({ error: 'Failed to retrieve movies from catalog.' });
  }
});

// Public: Fetch general storefront settings
publicRouter.get('/settings', async (_req: Request, res: Response) => {
  try {
    const dbStatus = getDBStatus();
    let settings: any = null;

    if (dbStatus.connected) {
      settings = await StorefrontSettingsModel.findOne({ key: 'global' }).lean();
    } else {
      settings = memoryStore.settings;
    }

    const rawVpa = settings?.upiConfig?.upiVpa || DEFAULT_UPI_CONFIG.upiVpa;
    const rawPayee = settings?.upiConfig?.payeeName || DEFAULT_UPI_CONFIG.payeeName;
    const resolvedUpi = resolveUpiConfig(rawVpa, rawPayee);

    res.json({
      featuredMovieId: settings?.featuredMovieId || 'mv-001',
      storefrontMaxTitles: settings?.storefrontMaxTitles || 5,
      upiConfig: {
        upiVpa: resolvedUpi.upiVpa,
        payeeName: resolvedUpi.payeeName,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve storefront settings.' });
  }
});

// ============================================================================
// UPI ORDER PREPARATION (PAY-PER-MOVIE ONLY)
// ============================================================================

// Helper to parse numeric price from string (e.g. "₹149" -> 149, "$4.99" -> 149)
function extractNumericPrice(priceStr: string): number {
  if (!priceStr) return 149;
  const cleaned = priceStr.replace(/[^0-9.]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) || parsed <= 0 ? 149 : Math.floor(parsed);
}

// POST /api/orders/create: Generate server-validated UPI Payment Order
publicRouter.post('/orders/create', async (req: Request, res: Response) => {
  try {
    const { movieId } = req.body || {};

    if (!movieId || typeof movieId !== 'string') {
      res.status(400).json({ error: 'movieId is required to generate a payment order.' });
      return;
    }

    const dbStatus = getDBStatus();
    let movie: any = null;
    let upiConfig = DEFAULT_UPI_CONFIG;

    if (dbStatus.connected) {
      movie = await MovieModel.findOne({ id: movieId, isEnabled: { $ne: false } }).lean();
      const settings = await StorefrontSettingsModel.findOne({ key: 'global' }).lean();
      if (settings?.upiConfig) {
        upiConfig = settings.upiConfig;
      }
    } else {
      movie = memoryStore.movies.find((m: any) => m.id === movieId && m.isEnabled !== false);
      if (memoryStore.settings?.upiConfig) {
        upiConfig = memoryStore.settings.upiConfig;
      }
    }

    if (!movie) {
      res.status(404).json({ error: 'Movie not found or not currently available for purchase.' });
      return;
    }

    // SERVER-AUTHORITATIVE PRICE LOOKUP
    // NEVER trust a price submitted from the client browser!
    const basePrice = extractNumericPrice(movie.priceSample);

    // Reserve a unique payable amount using a small paise adjustment (0.01 - 0.99)
    // This allows automated email / bank transaction matching in Phase 3
    const randomPaise = Math.floor(Math.random() * 95) + 5; // e.g. 5 to 99 paise
    const payableAmount = Number((basePrice + randomPaise / 100).toFixed(2));

    // Unique Order ID
    const timestampPart = Date.now().toString(36).toUpperCase();
    const randomPart = Math.floor(1000 + Math.random() * 9000);
    const orderId = `FLX-${timestampPart}-${randomPart}`;

    // Resolve and validate configured UPI VPA - DO NOT silently substitute placeholders
    const resolvedUpi = resolveUpiConfig(upiConfig?.upiVpa, upiConfig?.payeeName);
    const vpaValidation = validateUpiVpa(resolvedUpi.upiVpa);
    if (!vpaValidation.isValid || !vpaValidation.vpa) {
      res.status(400).json({
        error: vpaValidation.error || 'UPI payments are not configured on this server.',
        code: 'UPI_VPA_CONFIG_REQUIRED',
        details:
          'A valid UPI VPA (e.g. yourname@okhdfcbank or merchant@paytm) must be configured in server environment (UPI_VPA) or Admin Settings before payment orders can be generated.',
      });
      return;
    }

    const upiVpa = vpaValidation.vpa;
    const upiPayeeName = (resolvedUpi.payeeName || 'FlixVault Cinema').trim();

    // Standard NPCI UPI Payment URI
    // pa has literal '@' (not '%40'), tr specifies the orderId, am is exact decimal INR
    const upiPaymentUri = buildUpiPaymentUri({
      pa: upiVpa,
      pn: upiPayeeName,
      am: payableAmount,
      cu: 'INR',
      tn: `FlixVault Order ${orderId}`,
      tr: orderId,
    });

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minute expiration

    // Safe development diagnostics (masking sensitive parts of VPA)
    const diagnostics = {
      uriScheme: 'upi://pay',
      maskedVpa: maskUpiVpa(upiVpa),
      exactAmount: payableAmount.toFixed(2),
      currency: 'INR',
      orderReference: orderId,
      transactionNote: `FlixVault Order ${orderId}`,
      uriSample: maskUpiUri(upiPaymentUri),
    };

    console.log(`[FlixVault UPI Order] Generated #${orderId}:`, {
      orderId,
      movie: movie.title,
      payableAmount: payableAmount.toFixed(2),
      vpa: maskUpiVpa(upiVpa),
      uri: maskUpiUri(upiPaymentUri),
    });

    const orderData = {
      orderId,
      movieId: movie.id,
      movieTitle: movie.title,
      originalPrice: basePrice,
      payableAmount,
      expectedAmountPaise: Math.round(payableAmount * 100),
      currency: 'INR',
      status: 'pending' as const,
      telegramChannelId: movie.telegramChannelId || '',
      upiVpa,
      upiPayeeName,
      upiPaymentUri,
      expiresAt,
      createdAt: new Date(),
    };

    if (dbStatus.connected) {
      await OrderModel.create(orderData);
    } else {
      memoryStore.orders.push(orderData);
    }

    res.status(201).json({
      success: true,
      order: {
        orderId,
        movieId: movie.id,
        movieTitle: movie.title,
        originalPrice: basePrice,
        payableAmount,
        currency: 'INR',
        status: 'pending',
        upiVpa,
        upiPayeeName,
        upiPaymentUri,
        expiresAt: expiresAt.toISOString(),
        createdAt: orderData.createdAt.toISOString(),
        diagnostics,
      },
    });
  } catch (err: any) {
    console.error('Order creation error:', err);
    res.status(500).json({ error: 'Failed to generate payment order.' });
  }
});

// GET /api/orders/:orderId: Fetch order status
publicRouter.get('/orders/:orderId', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const dbStatus = getDBStatus();
    let order: any = null;

    if (dbStatus.connected) {
      order = await OrderModel.findOne({ orderId }).lean();
    } else {
      order = memoryStore.orders.find((o: any) => o.orderId === orderId);
    }

    if (!order) {
      res.status(404).json({ error: 'Order not found.' });
      return;
    }

    // Auto-mark expired if past expiresAt
    let currentStatus = order.status;
    if (currentStatus === 'pending' && new Date() > new Date(order.expiresAt)) {
      currentStatus = 'expired';
      if (dbStatus.connected) {
        await OrderModel.updateOne({ orderId }, { $set: { status: 'expired' } });
      } else {
        order.status = 'expired';
      }
    }

    res.json({
      orderId: order.orderId,
      movieTitle: order.movieTitle,
      payableAmount: order.payableAmount,
      currency: order.currency,
      status: currentStatus,
      expiresAt: order.expiresAt,
      createdAt: order.createdAt,
      maskedUtr: order.maskedUtr || (order.userUtr ? `${order.userUtr.slice(0, 4)}****${order.userUtr.slice(-4)}` : undefined),
      verifiedAt: order.verifiedAt,
      verificationReason: order.verificationReason,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve order status.' });
  }
});

// ============================================================================
// ADMIN AUTHENTICATION
// ============================================================================

// Public Auth: Verify Admin Access Code and Establish Secure Session
publicRouter.post('/auth/login', loginRateLimiter, (req: Request, res: Response) => {
  const { accessCode } = req.body || {};

  if (!accessCode || typeof accessCode !== 'string') {
    res.status(400).json({ error: 'Access code is required.' });
    return;
  }

  const validCode = getAdminAccessCode();

  if (accessCode.trim() !== validCode.trim()) {
    res.status(401).json({
      error: 'Invalid access code. Please verify credentials.',
      code: 'INVALID_CREDENTIALS',
    });
    return;
  }

  // Issue cryptographically signed token
  const token = createSessionToken();
  setAdminSessionCookie(res, token, req);

  res.json({
    success: true,
    message: 'Admin authentication verified successfully.',
    token, // Also returned for client headers if cookies are blocked in cross-origin sandbox
  });
});

// Public Auth: Logout Admin
publicRouter.post('/auth/logout', (req: Request, res: Response) => {
  clearAdminSessionCookie(res, req);
  res.json({ success: true, message: 'Logged out successfully.' });
});

// Public Auth: Check Active Session
publicRouter.get('/auth/me', (req: Request, res: Response) => {
  const token =
    req.cookies?.flixvault_admin_session ||
    req.headers.authorization?.replace(/^Bearer\s+/i, '');

  const isAuthenticated = !!token && verifySessionToken(token);

  res.json({
    authenticated: isAuthenticated,
    role: isAuthenticated ? 'admin' : 'visitor',
  });
});

// Public: Stream movie poster image directly from MongoDB GridFS
publicRouter.get('/movies/:id/poster', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const dbStatus = getDBStatus();
    let movie: any = null;

    if (dbStatus.connected) {
      movie = await MovieModel.findOne({ id }).lean();
    } else {
      movie = memoryStore.movies.find((m: any) => m.id === id);
    }

    if (!movie) {
      res.status(404).json({ error: 'Movie not found.' });
      return;
    }

    // If posterStorageId is present, retrieve from MongoDB GridFS
    if (movie.posterStorageId) {
      const result = await getPosterStreamFromGridFS(movie.posterStorageId);
      if (!result) {
        res.status(404).json({ error: 'Poster image file not found in storage.' });
        return;
      }

      const { stream, file } = result;
      const etag = `"${file._id}-${file.uploadDate ? new Date(file.uploadDate).getTime() : '1'}"`;

      if (req.headers['if-none-match'] === etag) {
        res.status(304).end();
        return;
      }

      res.setHeader('Content-Type', file.contentType || 'image/jpeg');
      if (file.length) {
        res.setHeader('Content-Length', file.length);
      }
      res.setHeader('ETag', etag);
      res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=3600');

      stream.on('error', (err) => {
        console.error('Error streaming poster from GridFS:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to stream poster image.' });
        }
      });

      stream.pipe(res);
      return;
    }

    // If customPosterUrl is an external link, redirect safely
    if (movie.customPosterUrl && movie.customPosterUrl.startsWith('http')) {
      res.redirect(302, movie.customPosterUrl);
      return;
    }

    res.status(404).json({ error: 'No poster image configured for this movie.' });
  } catch (err: any) {
    console.error('Error retrieving movie poster:', err);
    res.status(500).json({ error: 'Internal server error retrieving poster.' });
  }
});

// Public: Stream poster image by raw GridFS fileId (supports both /posters/:fileId and /images/posters/:fileId)
const streamPosterHandler = async (req: Request, res: Response) => {
  try {
    const { fileId } = req.params;

    // Validate MongoDB ObjectId format
    if (!fileId || !/^[0-9a-fA-F]{24}$/.test(fileId)) {
      res.status(400).json({
        error: 'Invalid poster reference ID format. Must be a 24-character hexadecimal ObjectId.',
      });
      return;
    }

    const result = await getPosterStreamFromGridFS(fileId);

    if (!result) {
      res.status(404).json({ error: 'Poster image file not found in storage.' });
      return;
    }

    const { stream, file } = result;
    const etag = `"${file._id}-${file.uploadDate ? new Date(file.uploadDate).getTime() : '1'}"`;

    if (req.headers['if-none-match'] === etag) {
      res.status(304).end();
      return;
    }

    res.setHeader('Content-Type', file.contentType || 'image/jpeg');
    if (file.length) {
      res.setHeader('Content-Length', file.length);
    }
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=3600');

    stream.on('error', (err) => {
      console.error('Error streaming poster by fileId from GridFS:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to stream poster image.' });
      }
    });

    stream.pipe(res);
  } catch (err: any) {
    console.error('Error in poster retrieval endpoint:', err);
    res.status(500).json({ error: 'Internal server error retrieving poster.' });
  }
};

publicRouter.get('/posters/:fileId', streamPosterHandler);
publicRouter.get('/images/posters/:fileId', streamPosterHandler);

// Protected Alias: Standalone Poster Upload directly to MongoDB GridFS (/api/posters/upload)
publicRouter.post(
  '/posters/upload',
  requireAdminAuth,
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

// Protected Alias: Attach poster to movie (/api/movies/:id/poster)
publicRouter.post(
  '/movies/:id/poster',
  requireAdminAuth,
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

      const validation = validateImageBuffer(file.buffer, file.mimetype);
      if (!validation.valid) {
        res.status(400).json({ error: validation.error });
        return;
      }

      const movie = await MovieModel.findOne({ id });
      if (!movie) {
        res.status(404).json({ error: 'Movie not found.' });
        return;
      }

      // Cleanup prior poster if replacing
      if (movie.posterStorageId) {
        try {
          await deletePosterFromGridFS(movie.posterStorageId);
        } catch (oldErr) {
          console.warn('Could not delete prior poster from GridFS:', oldErr);
        }
      }

      const result = await storePosterInGridFS({
        buffer: file.buffer,
        originalFilename: file.originalname,
        declaredContentType: file.mimetype,
        movieId: id,
      });

      movie.posterStorageId = result.fileId;
      movie.customPosterUrl = result.posterUrl;
      movie.posterContentType = result.contentType;
      movie.posterSize = result.size;
      movie.posterUpdatedAt = new Date();
      await movie.save();

      res.status(200).json({
        success: true,
        movie,
        poster: result,
        message: 'Poster uploaded and linked to movie in MongoDB successfully.',
      });
    } catch (err: any) {
      console.error('Error linking poster to movie:', err);
      res.status(500).json({ error: 'Failed to upload and attach poster to movie.' });
    }
  }
);

// Protected Alias: Delete poster from movie (/api/movies/:id/poster)
publicRouter.delete('/movies/:id/poster', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const dbStatus = getDBStatus();

    if (!dbStatus.connected) {
      res.status(503).json({
        error: 'MongoDB connection required to modify poster storage.',
        code: 'DATABASE_DISCONNECTED',
      });
      return;
    }

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
      message: 'Movie poster removed successfully from MongoDB GridFS.',
    });
  } catch (err: any) {
    console.error('Error deleting movie poster:', err);
    res.status(500).json({ error: 'Failed to remove movie poster.' });
  }
});


