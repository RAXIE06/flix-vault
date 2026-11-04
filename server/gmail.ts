/**
 * FlixVault Gmail IMAP Service
 * Now supports multiple payment senders (FamPay + Slice)
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
  verifiedSenders: string[];   // NEW: all allowed senders
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

let isImapOperationActive = false;
let lastConnectionAttemptTime = 0;
const MIN_TEST_INTERVAL_MS = 2500;

/**
 * Reads and validates Gmail IMAP configuration
 */
export function getGmailConfig(): GmailConfig {
  const host = (process.env.GMAIL_IMAP_HOST || 'imap.gmail.com').trim();
  const port = parseInt(process.env.GMAIL_IMAP_PORT || '993', 10);
  const user = (process.env.GMAIL_USER || '').trim();
  const appPassword = (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');
  const verifiedSender = (process.env.GMAIL_VERIFIED_SENDER || 'no-replay@famapp.in').trim();

  // NEW: Additional senders (comma-separated). Slice included by default.
  const additionalRaw = (
    process.env.GMAIL_ADDITIONAL_SENDERS ??
    'noreply@slice.bank.in,no-reply@famapp.in,no-replay@famapp.in,famapp.in,fampay.in'
  ).trim();
  const additional = additionalRaw.split(',').map((s) => s.trim()).filter(Boolean);
  const verifiedSenders = Array.from(
    new Set([verifiedSender, ...additional].filter(Boolean))
  );

  return {
    host,
    port: isNaN(port) ? 993 : port,
    user,
    appPassword,
    verifiedSender,
    verifiedSenders,
  };
}

export function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return 'Not configured';
  const [local, domain] = email.split('@');
  if (local.length <= 3) return `${local.charAt(0)}***@${domain}`;
  const start = local.slice(0, 2);
  const end = local.slice(-2);
  return `${start}***${end}@${domain}`;
}

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
    autoVerificationActive: false,
  };
}

function sanitizeErrorMessage(err: any): string {
  if (!err) return 'Unknown error occurred during IMAP operation';
  let message = typeof err === 'string' ? err : err.message || 'IMAP operation failed';

  const config = getGmailConfig();
  if (config.appPassword) message = message.split(config.appPassword).join('***');
  if (config.user) message = message.split(config.user).join(maskEmail(config.user));

  if (message.includes('AUTHENTICATIONFAILED') || message.includes('Invalid credentials')) {
    return 'Gmail IMAP authentication failed. Please verify GMAIL_USER and GMAIL_APP_PASSWORD (16-char App Password).';
  }
  if (message.includes('ETIMEDOUT') || message.includes('ECONNREFUSED')) {
    return `Connection timed out while reaching ${config.host}:${config.port}. Check firewall or network connectivity.`;
  }
  if (message.includes('ENOTFOUND')) {
    return `IMAP host "${config.host}" could not be resolved. Verify GMAIL_IMAP_HOST.`;
  }
  return message;
}

export function createImapClient(config: GmailConfig): ImapFlow {
  return new ImapFlow({
    host: config.host,
    port: config.port,
    secure: true,
    auth: { user: config.user, pass: config.appPassword || '' },
    logger: false,
    connectionTimeout: 10000,
    greetingTimeout: 6000,
    socketTimeout: 15000,
  });
}

/**
 * Helper: Detect which configured sender matches a parsed email
 */
function pickMatchedSender(parsed: any, envelope: any, senders: string[]): string {
  const fromText = (parsed?.from?.text || '').toLowerCase();
  const fromAddr = (envelope?.from?.[0]?.address || '').toLowerCase();

  for (const s of senders) {
    const sl = s.toLowerCase();
    if (fromText.includes(sl) || fromAddr.includes(sl)) return s;
  }
  // Fallback: match by domain only
  for (const s of senders) {
    const domain = s.split('@')[1];
    if (!domain) continue;
    if (fromText.includes(domain) || fromAddr.includes(domain)) return s;
  }
  return senders[0] || 'unknown';
}

export async function testGmailImapConnection(): Promise<GmailConnectionTestResult> {
  const now = Date.now();
  if (now - lastConnectionAttemptTime < MIN_TEST_INTERVAL_MS) {
    return {
      success: false,
      message: 'Rate limit applied: please wait a few seconds before testing again.',
      durationMs: 0,
      ordersMarkedPaid: 0,
      error: 'Rate limit: connection test throttled',
    };
  }
  lastConnectionAttemptTime = now;

  if (isImapOperationActive) {
    return {
      success: false,
      message: 'Another IMAP operation is currently in progress.',
      durationMs: 0,
      ordersMarkedPaid: 0,
      error: 'Connection busy',
    };
  }

  const config = getGmailConfig();
  if (!config.user || !config.user.includes('@')) {
    return {
      success: false,
      message: 'GMAIL_USER is not configured.',
      durationMs: 0,
      ordersMarkedPaid: 0,
      error: 'Missing GMAIL_USER',
    };
  }
  if (!config.appPassword || config.appPassword.length < 8) {
    return {
      success: false,
      message: 'GMAIL_APP_PASSWORD is not configured. Use a 16-char Google App Password.',
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

    const status = await client.status('INBOX', {
      messages: true,
      unseen: true,
      uidNext: true,
    });

    // NEW: Search ALL configured senders
    let matchingUids: number[] = [];
    for (const sender of config.verifiedSenders) {
      try {
        const res = await client.search({ from: sender });
        const uids = Array.isArray(res) ? res : [];
        matchingUids.push(...uids);
      } catch (searchErr) {
        console.error(`Safe mailbox search warning for ${sender}:`, searchErr);
      }
    }
    matchingUids = Array.from(new Set(matchingUids)).sort((a, b) => a - b);

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

          const matchedSender = pickMatchedSender(parsed, msg.envelope, config.verifiedSenders);
          const diagResult = parsePaymentAlert(payload, matchedSender);

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
      ? `Connected. Found ${matchingUids.length} payment email(s) across ${config.verifiedSenders.length} sender(s).`
      : `Connected. No emails found from: ${config.verifiedSenders.join(', ')}`;

    return {
      success: true,
      message,
      durationMs,
      mailbox: mailboxStats,
      senderCheck: {
        exactSenderConfigured: config.verifiedSenders.join(', '),
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
    } catch {}
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

export async function fetchRecentEmailDiagnostics(limit: number = 10): Promise<{
  success: boolean;
  count: number;
  emails: DiagnosticEmailSummary[];
  error?: string;
}> {
  const config = getGmailConfig();
  if (!config.user || !config.appPassword) {
    return { success: false, count: 0, emails: [], error: 'Gmail IMAP credentials not configured.' };
  }
  if (isImapOperationActive) {
    return { success: false, count: 0, emails: [], error: 'Another IMAP operation is active.' };
  }

  isImapOperationActive = true;
  const client = createImapClient(config);
  const boundedLimit = Math.max(1, Math.min(limit, 25));

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    const summaries: DiagnosticEmailSummary[] = [];

    try {
      const status = await client.status('INBOX', { messages: true });
      const total = (status && typeof status === 'object' && status.messages) ? status.messages : 0;

      if (total > 0) {
        const startSeq = Math.max(1, total - boundedLimit + 1);
        const range = `${startSeq}:${total}`;

        for await (const message of client.fetch(range, { envelope: true, source: true, uid: true })) {
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

            const matchedSender = pickMatchedSender(parsed, message.envelope, config.verifiedSenders);
            const diagResult = parsePaymentAlert(payload, matchedSender);

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
    summaries.reverse();

    return { success: true, count: summaries.length, emails: summaries };
  } catch (err: any) {
    try {
      await client.logout().catch(() => {});
      client.close();
    } catch {}
    return { success: false, count: 0, emails: [], error: sanitizeErrorMessage(err) };
  } finally {
    isImapOperationActive = false;
  }
}
