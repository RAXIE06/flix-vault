export interface Movie {
  id: string;
  title: string;
  year: number;
  genres: string[];
  duration: string;
  rating: string;
  director: string;
  cast: string[];
  synopsis: string;
  tagline: string;
  priceSample: string; // e.g. "₹149"
  priceNumeric?: number; // Base price number e.g. 149
  accessType: 'pay_per_movie';
  accessLabel: string; // e.g. "Pay per Movie · ₹149"
  resolution: '480p' | '720p' | '1080p' | '2K' | '4K' | '8K';
  audio: 'Dolby Atmos' | '5.1 Surround';
  languages?: string[]; // Multiple languages (Hindi, English, Tamil, etc.)
  posterAspectRatio?: '2:3' | '16:9' | '1:1' | '4:5'; // Poster display aspect ratio
  isFeatured?: boolean;
  isEnabled?: boolean; // Controls whether this movie is published to the public storefront
  telegramChannelId?: string; // Associated private Telegram delivery channel ID / handle
  customPosterUrl?: string; // Optional custom poster image URL or data URI
  posterStorageId?: string; // MongoDB GridFS ObjectId storage reference
  posterContentType?: string; // e.g. "image/jpeg", "image/png"
  posterSize?: number; // File size in bytes
  posterUpdatedAt?: string;
  artwork: {
    bgGradient: string;
    glowColor: string;
    accentColor: string;
    motif: 'nebula' | 'cyberpunk' | 'noir' | 'archive' | 'quantum' | 'deepsea' | 'solaris' | 'monolith';
  };
}

export interface PosterUploadResponse {
  success: boolean;
  fileId: string;
  posterUrl: string;
  contentType: string;
  size: number;
  filename: string;
  message?: string;
}

export interface UpiOrderDiagnostics {
  uriScheme: string;
  maskedVpa: string;
  exactAmount: string;
  currency: string;
  orderReference: string;
  transactionNote: string;
  uriSample: string;
}

export interface UpiPaymentOrder {
  orderId: string;
  movieId: string;
  movieTitle: string;
  originalPrice: number;
  payableAmount: number;
  expectedAmountPaise?: number;
  currency: 'INR';
  status: 'pending' | 'verified' | 'expired' | 'failed' | 'needs_review';
  telegramChannelId?: string;
  telegramInviteLink?: string;
  upiVpa: string;
  upiPayeeName: string;
  upiPaymentUri: string;
  expiresAt: string;
  createdAt: string;
  matchedAmountPaise?: number;
  matchedAmountRupees?: number;
  matchedUtr?: string;
  maskedUtr?: string;
  fampayTxnId?: string;
  paymentTimestamp?: string;
  verifiedAt?: string;
  verificationReason?: string;
  verificationSource?: string;
  diagnostics?: UpiOrderDiagnostics;
}

export interface PaymentVerificationScanResponse {
  success: boolean;
  scannedEmailsCount: number;
  ordersVerifiedCount: number;
  ordersNeedsReviewCount: number;
  duplicatesRejectedCount: number;
  details: Array<{
    success: boolean;
    orderId: string;
    status: string;
    reason: string;
    matchedAmountPaise?: number;
    expectedAmountPaise?: number;
    maskedUtr?: string;
    fampayTxnId?: string;
  }>;
  durationMs: number;
  error?: string;
}

export interface UpiConfig {
  upiVpa: string;
  payeeName: string;
  paiseMinRange: number;
  paiseMaxRange: number;
}

export interface TelegramConfig {
  botUsername: string;
  botConfigured: boolean;
  channelNamePlaceholder: string;
  webhookStatus: 'Pending Server Integration' | 'Active' | 'Disconnected';
  adminNotes: string;
}

export type SortOption = 'latest' | 'oldest' | 'title-asc' | 'title-desc';

export interface InfoModalContent {
  title: string;
  type: 'about' | 'contact' | 'terms' | 'privacy';
}

export interface GmailConfigStatus {
  configured: boolean;
  host: string;
  port: number;
  userMasked: string;
  verifiedSender: string;
  phase: string;
  autoVerificationActive: boolean;
}

export interface SenderCheckInspection {
  transactionAmount: {
    amountInRupees: number;
    amountInPaise: number;
    currency: 'INR';
    rawText: string;
  } | null;
  transactionId: string | null;
  utr: string | null;
  paymentStatus: string;
  timestamp: string | null;
  payerName: string | null;
  confidence: string;
  subject: string;
  exactSender: string;
  missingFields: string[];
}

export interface SenderCheckResult {
  exactSenderConfigured: string;
  foundInMailbox: boolean;
  matchingEmailsCount: number;
  latestAlertInspection: SenderCheckInspection | null;
}

export interface GmailConnectionTestResult {
  success: boolean;
  message: string;
  durationMs: number;
  mailbox?: {
    messagesTotal?: number;
    unseen?: number;
    uidNext?: number;
  };
  senderCheck?: SenderCheckResult;
  ordersMarkedPaid: number;
  error?: string;
}

export interface FamPayDiagnosticResult {
  isFamPayCandidate: boolean;
  isVerifiedSender: boolean;
  senderAddress: string;
  subject: string;
  detectedStatus: 'SUCCESS' | 'FAILED' | 'PENDING' | 'REFUND' | 'UNKNOWN';
  detectedAmount: {
    amountInRupees: number;
    amountInPaise: number;
    currency: 'INR';
    rawText: string;
  } | null;
  detectedUtr: string | null;
  detectedTimestamp: string | null;
  payerVpa: string | null;
  payerName: string | null;
  fampayTxnId: string | null;
  parseConfidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNRECOGNIZED';
  missingFields: string[];
  limitations: string[];
}

export interface DiagnosticEmailSummary {
  uid: number;
  date: string | null;
  from: string;
  subject: string;
  detectedStatus: string;
  detectedAmount: { amountInRupees: number; amountInPaise: number } | null;
  detectedUtr: string | null;
  parseConfidence: string;
  isVerifiedSender: boolean;
  limitations: string[];
}

// ============================================================
// BATCH 2 ADDITIONS — Languages & Aspect Ratios
// ============================================================

export interface AvailableLanguagesResponse {
  languages: string[];
  aspectRatios: Array<{ value: string; label: string }>;
}

// ============================================================
// BATCH 3 ADDITIONS — Analytics
// ============================================================

export interface MovieAnalytics {
  movieId: string;
  movieTitle: string;
  totalOrders: number;
  verifiedOrders: number;
  pendingOrders: number;
  expiredOrders: number;
  totalRevenue: number;         // Sum of verified order amounts
  uniqueBuyers: number;         // Unique UTR count for this movie
}

export interface AnalyticsSummary {
  totalRevenue: number;
  totalOrders: number;
  totalVerifiedOrders: number;
  totalPendingOrders: number;
  totalExpiredOrders: number;
  perMovie: MovieAnalytics[];
  lastUpdated: string;
}

// ============================================================
// BATCH 3 ADDITIONS — Order Recovery
// ============================================================

export interface UserOrderRecord {
  orderId: string;
  movieId: string;
  movieTitle: string;
  payableAmount: number;
  status: 'pending' | 'verified' | 'expired' | 'failed' | 'needs_review';
  telegramInviteLink?: string;
  verifiedAt?: string;
  createdAt: string;
  savedAt: number; // Client-side timestamp when saved to localStorage
}
