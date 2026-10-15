import mongoose from 'mongoose';
import { MovieModel } from './models/Movie';
import { StorefrontSettingsModel } from './models/StorefrontSettings';
import { ALL_MOVIES_CATALOG, INITIAL_TELEGRAM_CONFIG } from '../src/data/movies';

let isConnected = false;
let connectionError: string | null = null;
let usingFallbackMemory = true;
let isIpWhitelistIssue = false;
let isConnecting = false;
let reconnectInterval: NodeJS.Timeout | null = null;

// Default UPI configuration
export const DEFAULT_UPI_CONFIG = {
  upiVpa: (process.env.UPI_VPA || '').trim(),
  payeeName: (process.env.UPI_PAYEE_NAME || 'FlixVault Cinema').trim(),
  paiseMinRange: 1,
  paiseMaxRange: 99,
};

// Cleanly handle asynchronous Mongoose connection events without unhandled throws
mongoose.connection.on('error', (err) => {
  isConnected = false;
  connectionError = err?.message || 'MongoDB connection error';
  console.warn('⚠️ [FlixVault DB] Connection status event:', connectionError);
});

mongoose.connection.on('disconnected', () => {
  isConnected = false;
  console.warn('⚠️ [FlixVault DB] MongoDB socket disconnected.');
});

mongoose.connection.on('connected', () => {
  isConnected = true;
  connectionError = null;
  usingFallbackMemory = false;
  isIpWhitelistIssue = false;
});


// In-memory store used if MONGODB_URI is absent, unreachable, or in fallback mode
export const memoryStore = {
  movies: JSON.parse(JSON.stringify(ALL_MOVIES_CATALOG)),
  orders: [] as any[],
  settings: {
    key: 'global',
    featuredMovieId: 'mv-001',
    storefrontMaxTitles: 5,
    upiConfig: { ...DEFAULT_UPI_CONFIG },
    telegramConfig: { ...INITIAL_TELEGRAM_CONFIG },
  },
};

export async function initDatabase(isManualRetry = false): Promise<boolean> {
  const uri = process.env.MONGODB_URI?.trim();

  if (!uri || uri.includes('<username>') || uri.includes('example.mongodb.net')) {
    if (!isManualRetry) {
      console.warn(
        '⚠️ [FlixVault DB] No configured MONGODB_URI in environment. Initializing in-memory catalog for development.'
      );
    }
    usingFallbackMemory = true;
    connectionError = 'MONGODB_URI not configured in server environment.';
    isIpWhitelistIssue = false;
    return false;
  }

  if (isConnecting) {
    return isConnected;
  }

  try {
    isConnecting = true;
    console.log(`🔄 [FlixVault DB] Attempting connection to MongoDB Atlas${isManualRetry ? ' (Manual Retry)' : ''}...`);

    // Disconnect any lingering socket if retrying
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect().catch(() => {});
    }

    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
    });

    isConnected = true;
    connectionError = null;
    usingFallbackMemory = false;
    isIpWhitelistIssue = false;
    console.log('✅ [FlixVault DB] Connected to MongoDB Atlas successfully.');

    // Stop background retry loop if active
    if (reconnectInterval) {
      clearInterval(reconnectInterval);
      reconnectInterval = null;
    }

    // Seed database if empty
    await seedDatabaseIfEmpty();
    return true;
  } catch (err: any) {
    isConnected = false;
    usingFallbackMemory = true;
    const rawError = err.message || 'Failed to connect to MongoDB Atlas';
    connectionError = rawError;

    // Detect if the failure is caused by an Atlas IP access restriction
    isIpWhitelistIssue =
      rawError.includes('whitelist') ||
      rawError.includes('Could not connect to any servers in your MongoDB Atlas cluster') ||
      rawError.includes('ECONNREFUSED') ||
      rawError.includes('ETIMEDOUT') ||
      rawError.includes('querySrv');

    console.warn('⚠️ [FlixVault DB] MongoDB connection pending or temporarily unreachable.');
    if (isIpWhitelistIssue) {
      console.warn(
        '💡 [FlixVault DB] MongoDB Atlas Network Access Tip: In cloud environments, IP addresses are dynamic. In MongoDB Atlas, go to "Network Access" -> "IP Access List" -> "Add IP Address" -> choose "Allow Access from Anywhere" (0.0.0.0/0).'
      );
    }
    console.warn('🛡️ [FlixVault DB] Storefront active on resilient fallback store. Features remain fully operational.');

    // Schedule gentle background retry if not already active
    scheduleBackgroundReconnect();
    return false;
  } finally {
    isConnecting = false;
  }
}

function scheduleBackgroundReconnect(): void {
  if (reconnectInterval) return;

  // Non-blocking, gentle retry every 30 seconds
  reconnectInterval = setInterval(async () => {
    if (!isConnected && process.env.MONGODB_URI) {
      await initDatabase(false).catch(() => {});
    }
  }, 30000);

  // Unref so timer does not prevent process exit in tests
  if (reconnectInterval.unref) {
    reconnectInterval.unref();
  }
}

async function seedDatabaseIfEmpty(): Promise<void> {
  try {
    const movieCount = await MovieModel.countDocuments();
    if (movieCount === 0) {
      console.log('🌱 [FlixVault DB] Seeding initial sample movies into MongoDB...');
      await MovieModel.insertMany(ALL_MOVIES_CATALOG);
      console.log(`✅ [FlixVault DB] Seeded ${ALL_MOVIES_CATALOG.length} movies.`);
    }

    const settingsCount = await StorefrontSettingsModel.countDocuments();
    if (settingsCount === 0) {
      console.log('🌱 [FlixVault DB] Seeding storefront settings into MongoDB...');
      await StorefrontSettingsModel.create({
        key: 'global',
        featuredMovieId: 'mv-001',
        storefrontMaxTitles: 5,
        upiConfig: DEFAULT_UPI_CONFIG,
        telegramConfig: INITIAL_TELEGRAM_CONFIG,
      });
      console.log('✅ [FlixVault DB] Seeded initial storefront settings.');
    }
  } catch (err) {
    console.warn('⚠️ [FlixVault DB] Seeding error:', err);
  }
}

export function getDBStatus() {
  return {
    connected: isConnected,
    usingFallback: usingFallbackMemory,
    databaseName: isConnected ? (mongoose.connection.name || 'flixvault') : 'in-memory',
    error: connectionError,
    isIpWhitelistIssue,
    resolutionGuidance: isIpWhitelistIssue
      ? 'MongoDB Atlas requires 0.0.0.0/0 (Allow Access from Anywhere) in Network Access because cloud hosting containers use dynamic outbound IPs.'
      : undefined,
  };
}
