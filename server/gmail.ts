/**
 * FlixVault Gmail IMAP Service
 * 
 * Provides secure, TLS-encrypted IMAP connectivity to Gmail for FamPay payment alerts.
 * Strictly adheres to security rules:
 * - Credentials remain server-side only.
 * - Password and secrets are NEVER logged, returned in API responses, or exposed to UI.
 * - Enforces timeouts and bounds on all mailbox operations.
 * - Prevents connection exhaustion with single-flight connection guards.
 */

import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { parsePaymentAlert, FamPayDiagnosticResult, EmailPayload } from './fampayParser';

export interface GmailConfig {
  host: string;
  port: number;
  user: string;
  appPassword?: string;
  verifiedSender: string;
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

export interface MailboxStatusInfo {
  messagesTotal: number;
  unseen: number;
  uidNext: number;
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
  mailbox?: MailboxStatusInfo;
  senderCheck?: SenderCheckResult;
  ordersMarkedPaid: number;
  error?: string;
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

// Concurrency guard to prevent multiple simultaneous IMAP connections
let isImapOperationActive = false;
let lastConnectionAttemptTime = 0;
const MIN_TEST_INTERVAL_MS = 2500; // Rate limit connection tests to prevent IMAP lockout

/**
 * Reads and validates Gmail IMAP configuration from environment variables
 */
export function getGmailConfig(): GmailConfig {
  const host = (process.env.GMAIL_IMAP_HOST || 'imap.gmail.com').trim();
  const port = parseInt(process.env.GMAIL_IMAP_PORT || '993', 10);
  const user = (process.env.GMAIL_USER || '').trim();
  // Strip whitespace from 16-character Google App Passwords (e.g. "abcd efgh ijkl mnop")
  const appPassword = (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');
  const verifiedSender = (process.env.GMAIL_VERIFIED_SENDER || 'no-replay@famapp.in').trim();

  return {
    host,
    port: isNaN(port) ? 993 : port,
    user,
    appPassword,
    verifiedSender,
  };
}

/**
 * Returns safe masked email address for admin diagnostic display
 * e.g. "myflixalerts@gmail.com" -> "my***ts@gmail.com"
 */
export function maskEmail(email: string): string {
  if (!email || !email.includes('@')) {
    return 'Not configured';
  }
  const [local, domain] = email.split('@');
  if (local.length <= 3) {
    return `${local.charAt(0)}***@${domain}`;
  }
  const start = local.slice(0, 2);
  const end = local.slice(-2);
  return `${start}***${end}@${domain}`;
}

/**
 * Returns safe diagnostic configuration status without any secret values
 */
export function getSafeGmailConfigStatus(): GmailConfigStatus {
  const config = getGmailConfig();
  const isConfigured = Boolean(
    config.user &&
    config.user.includes('@') &&
    config.appPassword &&
    config.appPassword.length >= 8
  );

  return {
    configured: isConfigured,
    host: config.host,
    port: config.port,
    userMasked: maskEmail(config.user),
    verifiedSender: config.verifiedSender,
    phase: 'Phase 3A: IMAP Integration & Diagnostic Parser',
    autoVerificationActive: false, // Strict: automatic verification is deferred to subsequent phase
  };
}

/**
 * Sanitizes error messages to guarantee no credentials or secrets are exposed
 */
function sanitizeErrorMessage(err: any): string {
  if (!err) return 'Unknown error occurred during IMAP operation';
  let message = typeof err === 'string' ? err : err.message || 'IMAP operation failed';

  const config = getGmailConfig();
  if (config.appPassword) {
    message = message.split(config.appPassword).join('***');
  }
  if (config.user) {
    message = message.split(config.user).join(maskEmail(config.user));
  }

  // Common Gmail-specific IMAP error guidance
  if (message.includes('AUTHENTICATIONFAILED') || message.includes('Invalid credentials')) {
    return 'Gmail IMAP authentication failed. Please verify that GMAIL_USER is correct and GMAIL_APP_PASSWORD is a valid 16-character Google App Password (not your primary account password).';
  }
  if (message.includes('ETIMEDOUT') || message.includes('ECONNREFUSED')) {
    return `Connection timed out while reaching ${config.host}:${config.port}. Check firewall or network connectivity.`;
  }
  if (message.includes('ENOTFOUND')) {
    return `IMAP host "${config.host}" could not be resolved. Please verify GMAIL_IMAP_HOST.`;
  }

  return message;
}

/**
 * Creates an ImapFlow client configured with strict timeouts and SSL
 */
export function createImapClient(config: GmailConfig): ImapFlow {
  return new ImapFlow({
    host: config.host,
    port: config.port,
    secure: true,
    auth: {
      user: config.user,
      pass: config.appPassword || '',
    },
    logger: false, // Disable default logger to prevent secrets in stdout
    connectionTimeout: 10000,
    greetingTimeout: 6000,
    socketTimeout: 15000,
  });
}

/**
 * Tests connection to Gmail IMAP server over SSL/TLS
 * Verifies credentials and checks INBOX metadata, then disconnects cleanly.
 */
export async function testGmailImapConnection(): Promise<GmailConnectionTestResult> {
  const now = Date.now();
  if (now - lastConnectionAttemptTime < MIN_TEST_INTERVAL_MS) {
    return {
      success: false,
      message: 'Rate limit applied: please wait a few seconds before testing the IMAP connection again.',
      durationMs: 0,
      ordersMarkedPaid: 0,
      error: 'Rate limit: connection test throttled',
    };
  }
  lastConnectionAttemptTime = now;

  if (isImapOperationActive) {
    return {
      success: false,
      message: 'Another IMAP operation is currently in progress. Please try again shortly.',
      durationMs: 0,
      ordersMarkedPaid: 0,
      error: 'Connection busy',
    };
  }

  const config = getGmailConfig();
  if (!config.user || !config.user.includes('@')) {
    return {
      success: false,
      message: 'GMAIL_USER is not configured in server environment.',
      durationMs: 0,
      ordersMarkedPaid: 0,
      error: 'Missing GMAIL_USER',
    };
  }

  if (!config.appPassword || config.appPassword.length < 8) {
    return {
      success: false,
      message: 'GMAIL_APP_PASSWORD is not configured in server environment. Use a 16-character Google App Password.',
      durationMs: 0,
      ordersMarkedPaid: 0,
      error: 'Missing GMAIL_APP_PASSWORD',
    };
  }

  const startTime = Date.now();
  isImapOperationActive = true;
  const client = createImapClient(config);

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');

    // Check INBOX status
    const status = await client.status('INBOX', {
      messages: true,
      unseen: true,
      uidNext: true,
    });

    const targetSender = config.verifiedSender || 'no-replay@famapp.in';
    let matchingUids: number[] = [];

    try {
      // 1. Search for exact sender or standard alias (no-reply@famapp.in / no-replay@famapp.in)
      const primaryRes = await client.search({ from: targetSender });
      matchingUids = Array.isArray(primaryRes) ? primaryRes : [];

      // 2. If empty and targetSender mentions famapp, search for both spellings
      if (matchingUids.length === 0 && (targetSender.includes('famapp') || targetSender.includes('fampay'))) {
        const aliasRes = await client.search({
          or: [{ from: 'no-reply@famapp.in' }, { from: 'no-replay@famapp.in' }, { from: 'famapp.in' }],
        });
        matchingUids = Array.isArray(aliasRes) ? aliasRes : [];
      }
    } catch (searchErr) {
      console.error('Safe mailbox search warning:', searchErr);
    }

    let latestAlertInspection: SenderCheckInspection | null = null;
    if (matchingUids.length > 0) {
      try {
        const latestUid = matchingUids[matchingUids.length - 1];
        const msg = await client.fetchOne(latestUid, { source: true, envelope: true });
        if (msg && msg.source) {
          const parsed: any = await (simpleParser as any)(msg.source);
          const payload: EmailPayload = {
            from: parsed?.from?.text || msg.envelope?.from?.[0]?.address || '',
            subject: parsed?.subject || msg.envelope?.subject || '',
            date: parsed?.date || msg.envelope?.date,
            text: parsed?.text || '',
            html: typeof parsed?.html === 'string' ? parsed?.html : undefined,
            messageId: parsed?.messageId,
          };

          const diagResult = parsePaymentAlert(payload, targetSender);

          latestAlertInspection = {
            transactionAmount: diagResult.detectedAmount,
            transactionId: diagResult.fampayTxnId,
            utr: diagResult.detectedUtr,
            paymentStatus: diagResult.detectedStatus,
            timestamp: diagResult.detectedTimestamp,
            payerName: diagResult.payerName,
            confidence: diagResult.parseConfidence,
            subject: diagResult.subject,
            exactSender: diagResult.senderAddress,
            missingFields: diagResult.missingFields,
          };
        }
      } catch (inspectErr) {
        console.error('Safe email inspection error:', inspectErr);
      }
    }

    lock.release();
    await client.logout();

    const durationMs = Date.now() - startTime;
    const mailboxStats: MailboxStatusInfo = {
      messagesTotal: (status && typeof status === 'object' && status.messages) ? status.messages : 0,
      unseen: (status && typeof status === 'object' && status.unseen) ? status.unseen : 0,
      uidNext: (status && typeof status === 'object' && status.uidNext) ? status.uidNext : 0,
    };

    const senderFound = matchingUids.length > 0;
    const message = senderFound
      ? `Connected to Gmail IMAP over SSL. Confirmed ${matchingUids.length} email(s) from ${targetSender} in mailbox.`
      : `Connected to Gmail IMAP over SSL. Mailbox is accessible, but no emails from ${targetSender} were found.`;

    return {
      success: true,
      message,
      durationMs,
      mailbox: mailboxStats,
      senderCheck: {
        exactSenderConfigured: targetSender,
        foundInMailbox: senderFound,
        matchingEmailsCount: matchingUids.length,
        latestAlertInspection,
      },
      ordersMarkedPaid: 0,
    };
  } catch (err: any) {
    try {
      await client.logout().catch(() => {});
      client.close();
    } catch {
      // Ignore disconnect errors
    }

    const durationMs = Date.now() - startTime;
    const sanitizedError = sanitizeErrorMessage(err);
    console.error('Safe IMAP Connection Diagnostic Error:', sanitizedError);

    return {
      success: false,
      message: 'Failed to establish IMAP connection to Gmail.',
      durationMs,
      ordersMarkedPaid: 0,
      error: sanitizedError,
    };
  } finally {
    isImapOperationActive = false;
  }
}

/**
 * Searches and fetches recent emails from INBOX with bounded limits and diagnostic parsing
 * NEVER returns raw email bodies or credentials.
 */
export async function fetchRecentEmailDiagnostics(limit: number = 10): Promise<{
  success: boolean;
  count: number;
  emails: DiagnosticEmailSummary[];
  error?: string;
}> {
  const config = getGmailConfig();
  if (!config.user || !config.appPassword) {
    return {
      success: false,
      count: 0,
      emails: [],
      error: 'Gmail IMAP credentials not configured in environment.',
    };
  }

  if (isImapOperationActive) {
    return {
      success: false,
      count: 0,
      emails: [],
      error: 'Another IMAP operation is active. Please retry shortly.',
    };
  }

  isImapOperationActive = true;
  const client = createImapClient(config);
  const boundedLimit = Math.max(1, Math.min(limit, 25)); // Hard bound: max 25 emails

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');

    const summaries: DiagnosticEmailSummary[] = [];

    try {
      // Bounded search: Fetch last N sequence numbers
      const status = await client.status('INBOX', { messages: true });
      const total = (status && typeof status === 'object' && status.messages) ? status.messages : 0;

      if (total > 0) {
        const startSeq = Math.max(1, total - boundedLimit + 1);
        const range = `${startSeq}:${total}`;

        for await (const message of client.fetch(range, {
          envelope: true,
          source: true,
          uid: true,
        })) {
          try {
            if (!message.source) {
              continue;
            }
            // Parse MIME message safely
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

            summaries.push({
              uid: message.uid,
              date: diagResult.detectedTimestamp,
              from: diagResult.senderAddress,
              subject: diagResult.subject,
              detectedStatus: diagResult.detectedStatus,
              detectedAmount: diagResult.detectedAmount
                ? {
                    amountInRupees: diagResult.detectedAmount.amountInRupees,
                    amountInPaise: diagResult.detectedAmount.amountInPaise,
                  }
                : null,
              detectedUtr: diagResult.detectedUtr,
              parseConfidence: diagResult.parseConfidence,
              isVerifiedSender: diagResult.isVerifiedSender,
              limitations: diagResult.limitations,
            });
          } catch (parseErr) {
            console.error('Error parsing individual email MIME:', parseErr);
          }
        }
      }
    } finally {
      lock.release();
    }

    await client.logout();

    // Reverse so newest appears first
    summaries.reverse();

    return {
      success: true,
      count: summaries.length,
      emails: summaries,
    };
  } catch (err: any) {
    try {
      await client.logout().catch(() => {});
      client.close();
    } catch {
      // Ignore disconnect errors
    }

    const safeErr = sanitizeErrorMessage(err);
    return {
      success: false,
      count: 0,
      emails: [],
      error: safeErr,
    };
  } finally {
    isImapOperationActive = false;
  }
}
