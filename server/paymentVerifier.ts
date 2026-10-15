/**
 * FlixVault Payment Verification Engine (Phase 3B)
 * 
 * Automatically verifies UPI pay-per-movie orders against FamApp payment alert emails.
 * 
 * Safety & Security Guarantees:
 * - Compares exact integer paise expected for the order against parsed alert paise.
 * - Extracts and stores UTR and FamApp transaction ID.
 * - Strictly rejects duplicate UTRs and duplicate FamApp transaction IDs across all orders.
 * - Enforces order payment window: payments received after expiration are rejected.
 * - Accepts only emails from verified FamApp/FamPay senders with SUCCESS status.
 * - Prevents false matches: refuses to match by amount alone without unique reference.
 * - If order association is ambiguous, preserves order as pending/needs_review.
 * - Idempotent: repeated email processing does not re-credit or corrupt orders.
 * - Safe concurrency: atomic updates prevent race conditions and duplicate crediting.
 * - Keeps credentials and raw email bodies strictly server-side.
 */

import { OrderModel, IOrderDoc } from './models/Order';
import { memoryStore, getDBStatus } from './db';
import {
  parsePaymentAlert,
  FamPayDiagnosticResult,
  extractOrderReference,
  isSenderVerified,
  EmailPayload,
} from './fampayParser';
import { getGmailConfig, createImapClient, maskEmail } from './gmail';
import { simpleParser } from 'mailparser';

export interface VerificationResult {
  success: boolean;
  orderId: string;
  status: 'verified' | 'needs_review' | 'expired' | 'failed' | 'pending';
  reason: string;
  matchedAmountPaise?: number;
  expectedAmountPaise?: number;
  utr?: string;
  maskedUtr?: string;
  fampayTxnId?: string;
  paymentTimestamp?: string;
  isDuplicateUtr?: boolean;
  isDuplicateTxnId?: boolean;
  isExpired?: boolean;
  isAmbiguous?: boolean;
  isIdempotent?: boolean;
}

export interface VerificationScanSummary {
  success: boolean;
  scannedEmailsCount: number;
  ordersVerifiedCount: number;
  ordersNeedsReviewCount: number;
  duplicatesRejectedCount: number;
  details: VerificationResult[];
  durationMs: number;
  error?: string;
}

// Concurrency lock to prevent concurrent verification scans
let isVerificationScanRunning = false;

/**
 * Masks 12-digit UTR for safe display
 * e.g. "428691827364" -> "4286****7364"
 */
export function maskUtr(utr?: string | null): string {
  if (!utr) return '—';
  const clean = utr.trim();
  if (clean.length <= 4) return clean;
  if (clean.length <= 8) {
    return `${clean.slice(0, 2)}****${clean.slice(-2)}`;
  }
  return `${clean.slice(0, 4)}****${clean.slice(-4)}`;
}

/**
 * Normalizes an order's expected amount to integer paise
 */
export function getOrderExpectedPaise(order: any): number {
  if (order.expectedAmountPaise && Number.isInteger(order.expectedAmountPaise)) {
    return order.expectedAmountPaise;
  }
  if (typeof order.payableAmount === 'number') {
    return Math.round(order.payableAmount * 100);
  }
  return 0;
}

/**
 * Checks whether an order is within its permitted payment window
 * Allows a 2-minute grace period for server clock drift
 */
export function isWithinPaymentWindow(
  order: any,
  paymentDate: Date,
  graceMinutes: number = 2
): { valid: boolean; reason?: string } {
  const graceMs = graceMinutes * 60 * 1000;
  const createdAtTime = new Date(order.createdAt).getTime() - graceMs;
  const expiresAtTime = new Date(order.expiresAt).getTime() + graceMs;
  const paymentTime = paymentDate.getTime();

  if (paymentTime > expiresAtTime) {
    return {
      valid: false,
      reason: `Payment timestamp (${paymentDate.toISOString()}) is outside permitted window. Order expired at ${new Date(order.expiresAt).toISOString()}.`,
    };
  }

  if (paymentTime < createdAtTime) {
    return {
      valid: false,
      reason: `Payment timestamp (${paymentDate.toISOString()}) predates order creation (${new Date(order.createdAt).toISOString()}).`,
    };
  }

  return { valid: true };
}

/**
 * Finds an order in MongoDB or memoryStore by orderId
 */
export async function findOrderById(orderId: string): Promise<any | null> {
  const dbStatus = getDBStatus();
  if (dbStatus.connected) {
    return await OrderModel.findOne({ orderId }).lean();
  }
  return memoryStore.orders.find((o: any) => o.orderId === orderId) || null;
}

/**
 * Finds an order with a duplicate matched UTR (excluding current orderId)
 */
export async function findOrderByUtr(
  utr: string,
  excludeOrderId?: string
): Promise<any | null> {
  if (!utr) return null;
  const dbStatus = getDBStatus();
  if (dbStatus.connected) {
    const query: any = {
      matchedUtr: utr,
      ...(excludeOrderId ? { orderId: { $ne: excludeOrderId } } : {}),
    };
    return await OrderModel.findOne(query).lean();
  }
  return (
    memoryStore.orders.find(
      (o: any) =>
        o.matchedUtr === utr && (!excludeOrderId || o.orderId !== excludeOrderId)
    ) || null
  );
}

/**
 * Finds an order with a duplicate FamApp Txn ID (excluding current orderId)
 */
export async function findOrderByFamPayTxnId(
  fampayTxnId: string,
  excludeOrderId?: string
): Promise<any | null> {
  if (!fampayTxnId) return null;
  const dbStatus = getDBStatus();
  if (dbStatus.connected) {
    const query: any = {
      fampayTxnId,
      ...(excludeOrderId ? { orderId: { $ne: excludeOrderId } } : {}),
    };
    return await OrderModel.findOne(query).lean();
  }
  return (
    memoryStore.orders.find(
      (o: any) =>
        o.fampayTxnId === fampayTxnId &&
        (!excludeOrderId || o.orderId !== excludeOrderId)
    ) || null
  );
}

/**
 * Atomically updates an order's verification status
 */
export async function updateOrderVerification(
  orderId: string,
  updates: {
    status: 'verified' | 'needs_review' | 'expired' | 'failed' | 'pending';
    matchedAmountPaise?: number;
    matchedAmountRupees?: number;
    matchedUtr?: string;
    maskedUtr?: string;
    fampayTxnId?: string;
    paymentTimestamp?: Date;
    verifiedAt?: Date;
    verificationReason: string;
    matchedEmailUid?: number;
  }
): Promise<boolean> {
  const dbStatus = getDBStatus();

  if (dbStatus.connected) {
    // If marking verified, perform atomic update to avoid concurrent double crediting
    const filter: any = { orderId };
    if (updates.status === 'verified') {
      filter.$or = [
        { status: 'pending' },
        { status: 'needs_review' },
        { matchedUtr: updates.matchedUtr }, // Idempotency
      ];
    }

    const res = await OrderModel.updateOne(filter, {
      $set: {
        status: updates.status,
        ...(updates.matchedAmountPaise !== undefined ? { matchedAmountPaise: updates.matchedAmountPaise } : {}),
        ...(updates.matchedAmountRupees !== undefined ? { matchedAmountRupees: updates.matchedAmountRupees } : {}),
        ...(updates.matchedUtr ? { matchedUtr: updates.matchedUtr, userUtr: updates.matchedUtr } : {}),
        ...(updates.maskedUtr ? { maskedUtr: updates.maskedUtr } : {}),
        ...(updates.fampayTxnId ? { fampayTxnId: updates.fampayTxnId } : {}),
        ...(updates.paymentTimestamp ? { paymentTimestamp: updates.paymentTimestamp } : {}),
        ...(updates.verifiedAt ? { verifiedAt: updates.verifiedAt } : {}),
        verificationReason: updates.verificationReason,
        verificationSource: 'gmail_imap',
        ...(updates.matchedEmailUid ? { matchedEmailUid: updates.matchedEmailUid } : {}),
      },
    });

    return res.modifiedCount > 0 || res.matchedCount > 0;
  } else {
    // In-memory update
    const idx = memoryStore.orders.findIndex((o: any) => o.orderId === orderId);
    if (idx === -1) return false;

    const existing = memoryStore.orders[idx];
    Object.assign(existing, {
      status: updates.status,
      ...(updates.matchedAmountPaise !== undefined ? { matchedAmountPaise: updates.matchedAmountPaise } : {}),
      ...(updates.matchedAmountRupees !== undefined ? { matchedAmountRupees: updates.matchedAmountRupees } : {}),
      ...(updates.matchedUtr ? { matchedUtr: updates.matchedUtr, userUtr: updates.matchedUtr } : {}),
      ...(updates.maskedUtr ? { maskedUtr: updates.maskedUtr } : {}),
      ...(updates.fampayTxnId ? { fampayTxnId: updates.fampayTxnId } : {}),
      ...(updates.paymentTimestamp ? { paymentTimestamp: updates.paymentTimestamp } : {}),
      ...(updates.verifiedAt ? { verifiedAt: updates.verifiedAt } : {}),
      verificationReason: updates.verificationReason,
      verificationSource: 'gmail_imap',
      ...(updates.matchedEmailUid ? { matchedEmailUid: updates.matchedEmailUid } : {}),
      updatedAt: new Date(),
    });
    return true;
  }
}

/**
 * Core Matching Algorithm for a single order and parsed FamPay alert
 */
export async function verifyOrderWithAlert(
  order: any,
  alert: FamPayDiagnosticResult,
  options: {
    emailDate?: Date | string;
    emailUid?: number;
    allowDirectIdMatch?: boolean;
  } = {}
): Promise<VerificationResult> {
  const orderId = order.orderId;
  const expectedPaise = getOrderExpectedPaise(order);

  // 1. Sender Verification
  if (!alert.isVerifiedSender) {
    const reason = `Rejected: Alert sender "${alert.senderAddress || 'unknown'}" is not in the verified FamPay sender allowlist.`;
    return {
      success: false,
      orderId,
      status: 'needs_review',
      reason,
    };
  }

  // 2. Status Check
  if (alert.detectedStatus !== 'SUCCESS') {
    const reason = `Rejected: Alert status is ${alert.detectedStatus}, not a verified successful payment credit.`;
    return {
      success: false,
      orderId,
      status: alert.detectedStatus === 'FAILED' ? 'failed' : 'needs_review',
      reason,
    };
  }

  // 3. Required Fields Check
  if (!alert.detectedAmount) {
    return {
      success: false,
      orderId,
      status: 'needs_review',
      reason: 'Rejected: Missing required amount in payment alert email.',
    };
  }

  if (!alert.detectedUtr) {
    return {
      success: false,
      orderId,
      status: 'needs_review',
      reason: 'Rejected: Missing required 12-digit UPI UTR / transaction reference in email.',
    };
  }

  const actualPaise = alert.detectedAmount.amountInPaise;
  const detectedUtr = alert.detectedUtr;
  const maskedUtrStr = maskUtr(detectedUtr);
  const fampayTxnId = alert.fampayTxnId || undefined;

  // 4. Idempotency Check
  if (order.status === 'verified' && order.matchedUtr === detectedUtr) {
    return {
      success: true,
      orderId,
      status: 'verified',
      reason: `Order already verified with UTR ${maskedUtrStr} (idempotent duplicate email).`,
      matchedAmountPaise: actualPaise,
      expectedAmountPaise: expectedPaise,
      utr: detectedUtr,
      maskedUtr: maskedUtrStr,
      fampayTxnId,
      isIdempotent: true,
    };
  }

  const applyUpdates = async (updates: any) => {
    Object.assign(order, updates);
    return await updateOrderVerification(orderId, updates);
  };

  // 5. Duplicate UTR check across all orders
  const existingWithUtr = await findOrderByUtr(detectedUtr, orderId);
  if (existingWithUtr) {
    const reason = `Duplicate UTR: ${maskedUtrStr} was already used to verify order ${existingWithUtr.orderId}. Reusing transaction references is strictly forbidden.`;
    await applyUpdates({
      status: 'needs_review',
      verificationReason: reason,
      maskedUtr: maskedUtrStr,
    });
    return {
      success: false,
      orderId,
      status: 'needs_review',
      reason,
      isDuplicateUtr: true,
      utr: detectedUtr,
      maskedUtr: maskedUtrStr,
    };
  }

  // 6. Duplicate FamApp Txn ID check across all orders
  if (fampayTxnId) {
    const existingWithTxn = await findOrderByFamPayTxnId(fampayTxnId, orderId);
    if (existingWithTxn) {
      const reason = `Duplicate FamApp Txn ID: ${fampayTxnId} was already recorded for order ${existingWithTxn.orderId}.`;
      await applyUpdates({
        status: 'needs_review',
        verificationReason: reason,
        fampayTxnId,
      });
      return {
        success: false,
        orderId,
        status: 'needs_review',
        reason,
        isDuplicateTxnId: true,
        fampayTxnId,
      };
    }
  }

  // 7. Payment Window / Expiration Check
  const paymentTimestamp = alert.detectedTimestamp
    ? new Date(alert.detectedTimestamp)
    : options.emailDate
    ? new Date(options.emailDate)
    : new Date();

  const windowCheck = isWithinPaymentWindow(order, paymentTimestamp);
  if (!windowCheck.valid) {
    const reason = windowCheck.reason || 'Payment received outside order permitted window.';
    await applyUpdates({
      status: 'expired',
      verificationReason: reason,
      maskedUtr: maskedUtrStr,
      paymentTimestamp,
    });
    return {
      success: false,
      orderId,
      status: 'expired',
      reason,
      isExpired: true,
      paymentTimestamp: paymentTimestamp.toISOString(),
    };
  }

  // 8. Prevent False Matches (Requirement 2)
  // "Do not match an email to an order using amount alone.
  //  Use the unique payment reference in the checkout instructions where available.
  //  If the current order design cannot reliably associate an incoming email with one specific order,
  //  keep the order pending and report the ambiguity in the admin dashboard.
  //  Never automatically assign one email to multiple orders."

  const hasExplicitOrderRef =
    alert.detectedOrderRef === orderId ||
    (alert.subject && alert.subject.includes(orderId)) ||
    (alert.fampayTxnId && alert.fampayTxnId === orderId);

  if (!hasExplicitOrderRef && !options.allowDirectIdMatch) {
    const reason = `Ambiguous match: Payment alert of ₹${(actualPaise / 100).toFixed(
      2
    )} (UTR: ${maskedUtrStr}) lacks unique payment reference (${orderId}). Cannot verify by amount alone. Requires admin review.`;
    await applyUpdates({
      status: 'needs_review',
      verificationReason: reason,
      maskedUtr: maskedUtrStr,
      paymentTimestamp,
    });
    return {
      success: false,
      orderId,
      status: 'needs_review',
      reason,
      isAmbiguous: true,
      utr: detectedUtr,
      maskedUtr: maskedUtrStr,
    };
  }

  // 9. Exact Integer Paise Match
  if (actualPaise !== expectedPaise) {
    const reason = `Amount mismatch: Order ${orderId} expected exactly ₹${(expectedPaise / 100).toFixed(
      2
    )} (${expectedPaise} paise), but received ₹${(actualPaise / 100).toFixed(
      2
    )} (${actualPaise} paise).`;
    await applyUpdates({
      status: 'needs_review',
      verificationReason: reason,
      matchedAmountPaise: actualPaise,
      matchedAmountRupees: actualPaise / 100,
      maskedUtr: maskedUtrStr,
      paymentTimestamp,
    });
    return {
      success: false,
      orderId,
      status: 'needs_review',
      reason,
      expectedAmountPaise: expectedPaise,
      matchedAmountPaise: actualPaise,
      utr: detectedUtr,
      maskedUtr: maskedUtrStr,
    };
  }

  // 10. SUCCESSFUL MATCH — Atomically mark verified
  const verifiedAt = new Date();
  const successReason = `Payment verified automatically via FamApp alert email. Exact amount ₹${(
    actualPaise / 100
  ).toFixed(2)} (${actualPaise} paise) matched with UTR ${maskedUtrStr}.`;

  const updated = await applyUpdates({
    status: 'verified',
    matchedAmountPaise: actualPaise,
    matchedAmountRupees: actualPaise / 100,
    matchedUtr: detectedUtr,
    maskedUtr: maskedUtrStr,
    fampayTxnId,
    paymentTimestamp,
    verifiedAt,
    verificationReason: successReason,
    matchedEmailUid: options.emailUid,
  });

  if (!updated) {
    return {
      success: false,
      orderId,
      status: 'needs_review',
      reason: 'Failed to atomically update order verification status (concurrent state conflict).',
    };
  }

  return {
    success: true,
    orderId,
    status: 'verified',
    reason: successReason,
    matchedAmountPaise: actualPaise,
    expectedAmountPaise: expectedPaise,
    utr: detectedUtr,
    maskedUtr: maskedUtrStr,
    fampayTxnId,
    paymentTimestamp: paymentTimestamp.toISOString(),
  };
}

/**
 * Matches an incoming email alert against all pending orders.
 * Strictly adheres to Requirement 2:
 * - If multiple orders share the amount and email lacks order reference, marks all ambiguous.
 * - Never credits multiple orders with one email.
 */
export async function matchAlertAgainstPendingOrders(
  alert: FamPayDiagnosticResult,
  rawMeta: { emailDate?: Date | string; emailUid?: number } = {}
): Promise<VerificationResult | null> {
  const dbStatus = getDBStatus();
  let pendingOrders: any[] = [];

  if (dbStatus.connected) {
    pendingOrders = await OrderModel.find({
      status: { $in: ['pending', 'needs_review'] },
    }).lean();
  } else {
    pendingOrders = memoryStore.orders.filter(
      (o: any) => o.status === 'pending' || o.status === 'needs_review'
    );
  }

  if (pendingOrders.length === 0) {
    return null;
  }

  // Check 1: Does the email contain an explicit order reference?
  if (alert.detectedOrderRef) {
    const matchingOrder = pendingOrders.find(
      (o) => o.orderId.toUpperCase() === alert.detectedOrderRef?.toUpperCase()
    );
    if (matchingOrder) {
      return await verifyOrderWithAlert(matchingOrder, alert, {
        emailDate: rawMeta.emailDate,
        emailUid: rawMeta.emailUid,
        allowDirectIdMatch: true,
      });
    }
  }

  // Check 2: If no explicit order reference, find orders with matching amount
  if (alert.detectedAmount) {
    const alertPaise = alert.detectedAmount.amountInPaise;
    const sameAmountOrders = pendingOrders.filter(
      (o) => getOrderExpectedPaise(o) === alertPaise
    );

    if (sameAmountOrders.length === 1) {
      // Single order with same amount, BUT email lacks order reference
      // As required by Phase 3B: "Do not match an email to an order using amount alone... report the ambiguity in the admin dashboard"
      const order = sameAmountOrders[0];
      const masked = maskUtr(alert.detectedUtr);
      const reason = `Ambiguous match: Payment alert of ₹${(alertPaise / 100).toFixed(
        2
      )} (UTR: ${masked}) has no unique order reference. Cannot verify by amount alone. Requires admin review.`;

      await updateOrderVerification(order.orderId, {
        status: 'needs_review',
        verificationReason: reason,
        maskedUtr: masked,
        matchedAmountPaise: alertPaise,
        matchedAmountRupees: alertPaise / 100,
        paymentTimestamp: alert.detectedTimestamp ? new Date(alert.detectedTimestamp) : undefined,
      });
      order.status = 'needs_review';
      order.verificationReason = reason;

      return {
        success: false,
        orderId: order.orderId,
        status: 'needs_review',
        reason,
        isAmbiguous: true,
        utr: alert.detectedUtr || undefined,
        maskedUtr: masked,
      };
    } else if (sameAmountOrders.length > 1) {
      // Multiple orders with same amount!
      const masked = maskUtr(alert.detectedUtr);
      const reason = `Ambiguous match: Multiple orders (${sameAmountOrders
        .map((o) => o.orderId)
        .join(', ')}) share payable amount ₹${(alertPaise / 100).toFixed(
        2
      )}. Email lacks order reference. Never assigning to multiple orders.`;

      for (const order of sameAmountOrders) {
        await updateOrderVerification(order.orderId, {
          status: 'needs_review',
          verificationReason: reason,
          maskedUtr: masked,
          matchedAmountPaise: alertPaise,
          matchedAmountRupees: alertPaise / 100,
        });
        order.status = 'needs_review';
        order.verificationReason = reason;
      }

      return {
        success: false,
        orderId: sameAmountOrders[0].orderId,
        status: 'needs_review',
        reason,
        isAmbiguous: true,
        utr: alert.detectedUtr || undefined,
        maskedUtr: masked,
      };
    }
  }

  return null;
}

/**
 * Executes a full IMAP Payment Verification Scan across recent emails.
 * Protected by a single-flight concurrency lock.
 */
export async function runPaymentVerificationScan(
  limit: number = 20
): Promise<VerificationScanSummary> {
  if (isVerificationScanRunning) {
    return {
      success: false,
      scannedEmailsCount: 0,
      ordersVerifiedCount: 0,
      ordersNeedsReviewCount: 0,
      duplicatesRejectedCount: 0,
      details: [],
      durationMs: 0,
      error: 'Another payment verification scan is currently running. Please wait for it to finish.',
    };
  }

  const startTime = Date.now();
  isVerificationScanRunning = true;
  const config = getGmailConfig();

  if (!config.user || !config.appPassword) {
    isVerificationScanRunning = false;
    return {
      success: false,
      scannedEmailsCount: 0,
      ordersVerifiedCount: 0,
      ordersNeedsReviewCount: 0,
      duplicatesRejectedCount: 0,
      details: [],
      durationMs: 0,
      error: 'Gmail IMAP credentials (GMAIL_USER and GMAIL_APP_PASSWORD) are not configured in server environment.',
    };
  }

  const client = createImapClient(config);
  const results: VerificationResult[] = [];
  let verifiedCount = 0;
  let reviewCount = 0;
  let duplicatesCount = 0;
  let scannedCount = 0;

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');

    try {
      const status = await client.status('INBOX', { messages: true });
      const total = (status && typeof status === 'object' && status.messages) ? status.messages : 0;

      if (total > 0) {
        const boundedLimit = Math.max(1, Math.min(limit, 30));
        const startSeq = Math.max(1, total - boundedLimit + 1);
        const range = `${startSeq}:${total}`;

        for await (const message of client.fetch(range, {
          envelope: true,
          source: true,
          uid: true,
        })) {
          scannedCount++;
          try {
            if (!message.source) continue;

            const parsed: any = await (simpleParser as any)(message.source);
            const payload: EmailPayload = {
              from: parsed?.from?.text || message.envelope?.from?.[0]?.address || '',
              subject: parsed?.subject || message.envelope?.subject || '',
              date: parsed?.date || message.envelope?.date,
              text: parsed?.text || '',
              html: typeof parsed?.html === 'string' ? parsed.html : undefined,
              messageId: parsed?.messageId,
            };

            const diagResult = parsePaymentAlert(payload, config.verifiedSender);

            // Only attempt verification on candidate emails from verified sender
            if (diagResult.isVerifiedSender && diagResult.detectedStatus === 'SUCCESS') {
              const matchResult = await matchAlertAgainstPendingOrders(diagResult, {
                emailDate: payload.date,
                emailUid: message.uid,
              });

              if (matchResult) {
                results.push(matchResult);
                if (matchResult.success && matchResult.status === 'verified') {
                  verifiedCount++;
                } else if (matchResult.isDuplicateUtr || matchResult.isDuplicateTxnId) {
                  duplicatesCount++;
                } else if (matchResult.status === 'needs_review') {
                  reviewCount++;
                }
              }
            }
          } catch (err) {
            console.error('Error processing individual message during verification scan:', err);
          }
        }
      }
    } finally {
      lock.release();
    }

    await client.logout();

    return {
      success: true,
      scannedEmailsCount: scannedCount,
      ordersVerifiedCount: verifiedCount,
      ordersNeedsReviewCount: reviewCount,
      duplicatesRejectedCount: duplicatesCount,
      details: results,
      durationMs: Date.now() - startTime,
    };
  } catch (err: any) {
    try {
      await client.logout().catch(() => {});
      client.close();
    } catch {
      // Ignore
    }

    return {
      success: false,
      scannedEmailsCount: scannedCount,
      ordersVerifiedCount: verifiedCount,
      ordersNeedsReviewCount: reviewCount,
      duplicatesRejectedCount: duplicatesCount,
      details: results,
      durationMs: Date.now() - startTime,
      error: typeof err === 'string' ? err : err.message || 'IMAP Verification Scan Failed',
    };
  } finally {
    isVerificationScanRunning = false;
  }
}
