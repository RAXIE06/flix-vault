/**
 * FlixVault Payment Verification Engine (Phase 3B)
 * Now supports FamApp, FamPay, and Slice Bank senders.
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
  matchedSender?: string;
  verificationMethod?: 'utr_match' | 'amount_time_match';
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

// NEW: Allowed sender domains — add/remove here
const ALLOWED_SENDER_DOMAINS = ['famapp.in', 'fampay.in', 'slice.bank.in'];

/**
 * NEW: Direct domain check, independent of parser flag
 * This lets Slice emails through even if fampayParser.ts hasn't been updated yet.
 */
function isAllowedSenderDomain(fromAddress: string): boolean {
  const f = (fromAddress || '').toLowerCase();
  return ALLOWED_SENDER_DOMAINS.some((d) => f.includes(d));
}

/**
 * NEW: Detect Slice bank sender
 */
function isSliceSender(fromAddress: string): boolean {
  return (fromAddress || '').toLowerCase().includes('slice.bank.in');
}

let isVerificationScanRunning = false;

export function maskUtr(utr?: string | null): string {
  if (!utr) return '—';
  const clean = utr.trim();
  if (clean.length <= 4) return clean;
  if (clean.length <= 8) return `${clean.slice(0, 2)}****${clean.slice(-2)}`;
  return `${clean.slice(0, 4)}****${clean.slice(-4)}`;
}

export function getOrderExpectedPaise(order: any): number {
  if (order.expectedAmountPaise && Number.isInteger(order.expectedAmountPaise)) {
    return order.expectedAmountPaise;
  }
  if (typeof order.payableAmount === 'number') {
    return Math.round(order.payableAmount * 100);
  }
  return 0;
}

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

export async function findOrderById(orderId: string): Promise<any | null> {
  const dbStatus = getDBStatus();
  if (dbStatus.connected) return await OrderModel.findOne({ orderId }).lean();
  return memoryStore.orders.find((o: any) => o.orderId === orderId) || null;
}

export async function findOrderByUtr(utr: string, excludeOrderId?: string): Promise<any | null> {
  if (!utr) return null;
  const dbStatus = getDBStatus();
  if (dbStatus.connected) {
    const query: any = { matchedUtr: utr, ...(excludeOrderId ? { orderId: { $ne: excludeOrderId } } : {}) };
    return await OrderModel.findOne(query).lean();
  }
  return memoryStore.orders.find(
    (o: any) => o.matchedUtr === utr && (!excludeOrderId || o.orderId !== excludeOrderId)
  ) || null;
}

export async function findOrderByFamPayTxnId(fampayTxnId: string, excludeOrderId?: string): Promise<any | null> {
  if (!fampayTxnId) return null;
  const dbStatus = getDBStatus();
  if (dbStatus.connected) {
    const query: any = { fampayTxnId, ...(excludeOrderId ? { orderId: { $ne: excludeOrderId } } : {}) };
    return await OrderModel.findOne(query).lean();
  }
  return memoryStore.orders.find(
    (o: any) => o.fampayTxnId === fampayTxnId && (!excludeOrderId || o.orderId !== excludeOrderId)
  ) || null;
}

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
    verificationMethod?: 'utr_match' | 'amount_time_match';
  }
): Promise<boolean> {
  const dbStatus = getDBStatus();

  if (dbStatus.connected) {
    const filter: any = { orderId };
    if (updates.status === 'verified') {
      filter.$or = [
        { status: 'pending' },
        { status: 'needs_review' },
        { matchedUtr: updates.matchedUtr },
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
        ...(updates.verificationMethod ? { verificationMethod: updates.verificationMethod } : {}),
        ...(updates.matchedEmailUid ? { matchedEmailUid: updates.matchedEmailUid } : {}),
      },
    });
    return res.modifiedCount > 0 || res.matchedCount > 0;
  } else {
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
      ...(updates.verificationMethod ? { verificationMethod: updates.verificationMethod } : {}),
      ...(updates.matchedEmailUid ? { matchedEmailUid: updates.matchedEmailUid } : {}),
      updatedAt: new Date(),
    });
    return true;
  }
}

export async function verifyOrderWithAlert(
  order: any,
  alert: FamPayDiagnosticResult,
  options: {
    emailDate?: Date | string;
    emailUid?: number;
    allowDirectIdMatch?: boolean;
    sliceNoUtrFallback?: boolean;
  } = {}
): Promise<VerificationResult> {
  const orderId = order.orderId;
  const expectedPaise = getOrderExpectedPaise(order);

  // 1. Sender check — bypass parser flag, check domain directly
  const senderAddr = alert.senderAddress || '';
  if (!isAllowedSenderDomain(senderAddr) && !alert.isVerifiedSender) {
    const reason = `Rejected: Alert sender "${senderAddr || 'unknown'}" is not in the verified sender allowlist.`;
    return { success: false, orderId, status: 'needs_review', reason };
  }

  // 2. Status check
  if (alert.detectedStatus !== 'SUCCESS') {
    const reason = `Rejected: Alert status is ${alert.detectedStatus}, not a verified successful payment credit.`;
    return {
      success: false,
      orderId,
      status: alert.detectedStatus === 'FAILED' ? 'failed' : 'needs_review',
      reason,
    };
  }

  // 3. Amount required
  if (!alert.detectedAmount) {
    return {
      success: false,
      orderId,
      status: 'needs_review',
      reason: 'Rejected: Missing required amount in payment alert email.',
    };
  }

  const actualPaise = alert.detectedAmount.amountInPaise;
  const detectedUtr = alert.detectedUtr;
  const maskedUtrStr = detectedUtr ? maskUtr(detectedUtr) : '—';
  const fampayTxnId = alert.fampayTxnId || undefined;
  const slice = isSliceSender(senderAddr);

  // 4. UTR check — for Slice, allow fallback if no UTR
  if (!detectedUtr && !(slice && options.sliceNoUtrFallback)) {
    return {
      success: false,
      orderId,
      status: 'needs_review',
      reason: 'Rejected: Missing required 12-digit UPI UTR / transaction reference in email.',
    };
  }

  // 5. Idempotency
  if (order.status === 'verified' && detectedUtr && order.matchedUtr === detectedUtr) {
    return {
      success: true,
      orderId,
      status: 'verified',
      reason: `Order already verified with UTR ${maskedUtrStr} (idempotent).`,
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

  // 6. Duplicate UTR
  if (detectedUtr) {
    const existingWithUtr = await findOrderByUtr(detectedUtr, orderId);
    if (existingWithUtr) {
      const reason = `Duplicate UTR: ${maskedUtrStr} was already used to verify order ${existingWithUtr.orderId}.`;
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
  }

  // 7. Duplicate Txn ID
  if (fampayTxnId) {
    const existingWithTxn = await findOrderByFamPayTxnId(fampayTxnId, orderId);
    if (existingWithTxn) {
      const reason = `Duplicate Txn ID: ${fampayTxnId} already recorded for order ${existingWithTxn.orderId}.`;
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

  // 8. Payment window
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

  // 9. Ambiguity check (order ref)
  const hasExplicitOrderRef =
    alert.detectedOrderRef === orderId ||
    (alert.subject && alert.subject.includes(orderId)) ||
    (alert.fampayTxnId && alert.fampayTxnId === orderId);

  if (!hasExplicitOrderRef && !options.allowDirectIdMatch) {
    const reason = `Ambiguous match: Payment alert of ₹${(actualPaise / 100).toFixed(
      2
    )} (UTR: ${maskedUtrStr}) lacks unique payment reference (${orderId}). Requires admin review.`;
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
      utr: detectedUtr || undefined,
      maskedUtr: maskedUtrStr,
    };
  }

  // 10. Exact paise match
  if (actualPaise !== expectedPaise) {
    const reason = `Amount mismatch: Order expected ₹${(expectedPaise / 100).toFixed(
      2
    )} (${expectedPaise} paise), received ₹${(actualPaise / 100).toFixed(2)} (${actualPaise} paise).`;
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
      utr: detectedUtr || undefined,
      maskedUtr: maskedUtrStr,
    };
  }

  // 11. SUCCESS
  const verifiedAt = new Date();
  const method: 'utr_match' | 'amount_time_match' = detectedUtr ? 'utr_match' : 'amount_time_match';
  const successReason = detectedUtr
    ? `Payment verified. Exact amount ₹${(actualPaise / 100).toFixed(2)} matched with UTR ${maskedUtrStr}.`
    : `Payment verified via Slice amount+time match. Amount ₹${(actualPaise / 100).toFixed(
        2
      )} matched within order window (no UTR available).`;

  const updated = await applyUpdates({
    status: 'verified',
    matchedAmountPaise: actualPaise,
    matchedAmountRupees: actualPaise / 100,
    ...(detectedUtr ? { matchedUtr: detectedUtr, maskedUtr: maskedUtrStr } : {}),
    fampayTxnId,
    paymentTimestamp,
    verifiedAt,
    verificationReason: successReason,
    matchedEmailUid: options.emailUid,
    verificationMethod: method,
  });

  if (!updated) {
    return {
      success: false,
      orderId,
      status: 'needs_review',
      reason: 'Failed to atomically update order (concurrent state conflict).',
    };
  }

  return {
    success: true,
    orderId,
    status: 'verified',
    reason: successReason,
    matchedAmountPaise: actualPaise,
    expectedAmountPaise: expectedPaise,
    utr: detectedUtr || undefined,
    maskedUtr: maskedUtrStr,
    fampayTxnId,
    paymentTimestamp: paymentTimestamp.toISOString(),
    matchedSender: senderAddr,
    verificationMethod: method,
  };
}

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

  if (pendingOrders.length === 0) return null;

  // Explicit order ref
  if (alert.detectedOrderRef) {
    const matchingOrder = pendingOrders.find(
      (o) => o.orderId.toUpperCase() === alert.detectedOrderRef?.toUpperCase()
    );
    if (matchingOrder) {
      return await verifyOrderWithAlert(matchingOrder, alert, {
        emailDate: rawMeta.emailDate,
        emailUid: rawMeta.emailUid,
        allowDirectIdMatch: true,
        sliceNoUtrFallback: true,
      });
    }
  }

  // Amount-based matching
  if (alert.detectedAmount) {
    const alertPaise = alert.detectedAmount.amountInPaise;
    const sameAmountOrders = pendingOrders.filter((o) => getOrderExpectedPaise(o) === alertPaise);
    const slice = isSliceSender(alert.senderAddress || '');
    const noUtr = !alert.detectedUtr;

    if (sameAmountOrders.length === 1) {
      const order = sameAmountOrders[0];

      // NEW: Slice fallback — no UTR + exactly 1 pending order + amount match → verify
      if (slice && noUtr) {
        return await verifyOrderWithAlert(order, alert, {
          emailDate: rawMeta.emailDate,
          emailUid: rawMeta.emailUid,
          allowDirectIdMatch: true,
          sliceNoUtrFallback: true,
        });
      }

      const masked = maskUtr(alert.detectedUtr);
      const reason = `Ambiguous match: Payment alert of ₹${(alertPaise / 100).toFixed(
        2
      )} (UTR: ${masked}) has no unique order reference. Requires admin review.`;
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
      const masked = maskUtr(alert.detectedUtr);
      const reason = `Ambiguous match: Multiple orders (${sameAmountOrders
        .map((o) => o.orderId)
        .join(', ')}) share amount ₹${(alertPaise / 100).toFixed(2)}. Never assigning to multiple orders.`;
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

export async function runPaymentVerificationScan(limit: number = 20): Promise<VerificationScanSummary> {
  if (isVerificationScanRunning) {
    return {
      success: false,
      scannedEmailsCount: 0,
      ordersVerifiedCount: 0,
      ordersNeedsReviewCount: 0,
      duplicatesRejectedCount: 0,
      details: [],
      durationMs: 0,
      error: 'Another scan is currently running.',
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
      error: 'Gmail IMAP credentials not configured.',
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
            const senderText =
              parsed?.from?.text || message.envelope?.from?.[0]?.address || '';

            // NEW: Direct domain gate — passes FamPay AND Slice
            if (!isAllowedSenderDomain(senderText)) {
              continue;
            }

            const payload: EmailPayload = {
              from: senderText,
              subject: parsed?.subject || message.envelope?.subject || '',
              date: parsed?.date || message.envelope?.date,
              text: parsed?.text || '',
              html: typeof parsed?.html === 'string' ? parsed.html : undefined,
              messageId: parsed?.messageId,
            };

            const diagResult = parsePaymentAlert(payload, senderText);

            // NEW: pass if parser thinks verified OR domain is allowed
            if (
              (diagResult.isVerifiedSender || isAllowedSenderDomain(senderText)) &&
              diagResult.detectedStatus === 'SUCCESS'
            ) {
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
            console.error('Error processing message:', err);
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
    } catch {}
    return {
      success: false,
      scannedEmailsCount: scannedCount,
      ordersVerifiedCount: verifiedCount,
      ordersNeedsReviewCount: reviewCount,
      duplicatesRejectedCount: duplicatesCount,
      details: results,
      durationMs: Date.now() - startTime,
      error: typeof err === 'string' ? err : err.message || 'IMAP Scan Failed',
    };
  } finally {
    isVerificationScanRunning = false;
  }
}
