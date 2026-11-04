/**
 * FamPay Email Alert Diagnostic Parser
 * Now supports Slice Bank payment alerts as well.
 *
 * Implements strict, defensive parsing of incoming payment alerts.
 * - Does not assume unvalidated formats.
 * - Extracts sender, status, amount, currency, UTR, and timestamp.
 * - Enforces verified sender allowlist (FamApp / FamPay / Slice).
 * - Flags unrecognized emails or missing fields with explicit limitations.
 * - Never treats arbitrary strings as payment proof.
 */

export interface ParsedAmount {
  amountInRupees: number;
  amountInPaise: number;
  currency: 'INR';
  rawText: string;
}

export type PaymentDetectedStatus = 'SUCCESS' | 'FAILED' | 'PENDING' | 'REFUND' | 'UNKNOWN';
export type ParseConfidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNRECOGNIZED';

export interface EmailPayload {
  from?: string;
  subject?: string;
  date?: Date | string;
  text?: string;
  html?: string;
  messageId?: string;
}

export interface FamPayDiagnosticResult {
  isFamPayCandidate: boolean;
  isVerifiedSender: boolean;
  senderAddress: string;
  subject: string;
  detectedStatus: PaymentDetectedStatus;
  detectedAmount: ParsedAmount | null;
  detectedUtr: string | null;
  detectedTimestamp: string | null;
  payerVpa: string | null;
  payerName: string | null;
  fampayTxnId: string | null;
  detectedOrderRef?: string | null;
  parseConfidence: ParseConfidence;
  missingFields: string[];
  limitations: string[];
  detectedProvider?: 'famapp' | 'fampay' | 'slice' | 'unknown'; // NEW
}

/**
 * Extracts a normalized, lowercase email address from a header string
 * e.g. "FamPay <alerts@fampay.in>" -> "alerts@fampay.in"
 */
export function extractEmailAddress(rawSender: string = ''): string {
  const match = rawSender.match(/<([^>]+)>/);
  if (match && match[1]) {
    return match[1].trim().toLowerCase();
  }
  return rawSender.trim().toLowerCase();
}

/**
 * NEW: Detect provider from sender address
 */
export function detectProvider(senderAddress: string): 'famapp' | 'fampay' | 'slice' | 'unknown' {
  const s = (senderAddress || '').toLowerCase();
  if (s.includes('slice.bank.in') || s.includes('slice')) return 'slice';
  if (s.includes('famapp.in')) return 'famapp';
  if (s.includes('fampay.in') || s.includes('fampay.club')) return 'fampay';
  return 'unknown';
}

/**
 * Checks if sender matches configured verified senders
 * Now includes Slice Bank.
 */
export function isSenderVerified(
  senderAddress: string,
  configuredSender?: string
): boolean {
  if (!senderAddress || !senderAddress.includes('@')) {
    return false;
  }

  const normalized = senderAddress.toLowerCase().trim();
  const canonicalSender = normalized.replace('no-replay@', 'no-reply@');

  // If user explicitly configured verified senders in env (comma-separated)
  if (configuredSender && configuredSender.trim()) {
    const configuredList = configuredSender
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    for (const allowed of configuredList) {
      const canonicalAllowed = allowed.replace('no-replay@', 'no-reply@');
      if (canonicalAllowed.startsWith('*@')) {
        const domain = canonicalAllowed.slice(2);
        if (canonicalSender.endsWith(`@${domain}`) || canonicalSender.endsWith(`.${domain}`)) {
          return true;
        }
      } else if (
        canonicalSender === canonicalAllowed ||
        normalized === allowed ||
        (allowed === 'no-replay@famapp.in' &&
          (normalized === 'no-reply@famapp.in' || normalized === 'no-replay@famapp.in'))
      ) {
        return true;
      }
    }
  }

  // Official FamApp / FamPay verified notification senders
  if (
    canonicalSender === 'no-reply@famapp.in' ||
    normalized === 'no-replay@famapp.in' ||
    normalized === 'no-reply@famapp.in' ||
    canonicalSender.endsWith('@famapp.in') ||
    canonicalSender.endsWith('@fampay.in') ||
    canonicalSender.endsWith('@fampay.club') ||
    normalized === 'alerts@fampay.in' ||
    normalized === 'payments@fampay.in' ||
    normalized === 'support@fampay.in'
  ) {
    return true;
  }

  // NEW: Slice Bank verified senders
  if (
    canonicalSender.endsWith('@slice.bank.in') ||
    canonicalSender === 'noreply@slice.bank.in' ||
    canonicalSender === 'no-reply@slice.bank.in' ||
    canonicalSender === 'alerts@slice.bank.in' ||
    canonicalSender === 'notifications@slice.bank.in'
  ) {
    return true;
  }

  return false;
}

/**
 * Strips HTML tags and excessive whitespace for body text inspection
 */
export function stripHtml(html: string = ''): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&₹/gi, '₹')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Detects payment status from subject and content
 * Slice-specific: "Received ₹X in your slice account" -> SUCCESS
 *                 "₹X debited from your slice account" -> FAILED (money out)
 */
export function detectPaymentStatus(text: string, subject: string): PaymentDetectedStatus {
  const combined = `${subject} ${text}`.toLowerCase();

  // NEW: Slice-specific debit detection (money OUT, not a payment TO us)
  // Slice debit emails use "debited from your slice account"
  if (/debited\s+from\s+your\s+slice\s+account/i.test(combined) ||
      /₹\s*[\d.]+\s*debited/i.test(combined)) {
    return 'FAILED';
  }

  // Explicit failure signals
  if (
    combined.includes('failed') ||
    combined.includes('declined') ||
    combined.includes('unsuccessful') ||
    combined.includes('payment failed') ||
    combined.includes('transaction failed') ||
    combined.includes('cancelled')
  ) {
    return 'FAILED';
  }

  // Explicit refund or reversal signals
  if (
    combined.includes('refund') ||
    combined.includes('reversed') ||
    combined.includes('reversal') ||
    combined.includes('chargeback')
  ) {
    return 'REFUND';
  }

  // Explicit pending signals
  if (
    combined.includes('pending') ||
    combined.includes('in progress') ||
    combined.includes('processing') ||
    combined.includes('awaiting confirmation')
  ) {
    return 'PENDING';
  }

  // NEW: Slice-specific credit detection
  // "Received ₹9.05 in your slice account" -> SUCCESS
  if (/received\s+₹\s*[\d.]+\s+in\s+your\s+slice\s+account/i.test(combined)) {
    return 'SUCCESS';
  }

  // Explicit success signals (FamPay + generic)
  if (
    combined.includes('received') ||
    combined.includes('credited') ||
    combined.includes('payment received') ||
    combined.includes('money added') ||
    combined.includes('successfully received') ||
    combined.includes('payment successful') ||
    combined.includes('paid you') ||
    combined.includes('sent you') ||
    combined.includes('money received from') ||
    combined.includes('credit alert')
  ) {
    return 'SUCCESS';
  }

  return 'UNKNOWN';
}

/**
 * Extracts amount in INR and converts to integer paise
 */
export function extractAmount(text: string): ParsedAmount | null {
  const patterns: RegExp[] = [
    /(?:₹|Rs\.?|INR)\s*([\d,]+(?:\.\d{1,2})?)/i,
    /(?:amount|received|credited|paid)[:\s]*(?:₹|Rs\.?|INR)?\s*([\d,]+(?:\.\d{1,2})?)/i,
    /([\d,]+(?:\.\d{1,2})?)\s*(?:₹|Rs\.?|INR|rupees)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const rawNumberStr = match[1].replace(/,/g, '');
      const num = parseFloat(rawNumberStr);
      if (!isNaN(num) && num > 0 && num < 10000000) {
        const decimalPart = rawNumberStr.includes('.') ? rawNumberStr.split('.')[1] : '';
        if (decimalPart.length <= 2) {
          const paise = Math.round(num * 100);
          return {
            amountInRupees: num,
            amountInPaise: paise,
            currency: 'INR',
            rawText: match[0].trim(),
          };
        }
      }
    }
  }

  return null;
}

/**
 * Extracts standard 12-digit UPI UTR or payment reference.
 * Extended to also look for Slice-specific transaction references.
 */
export function extractUtr(text: string): string | null {
  const labeledPatterns: RegExp[] = [
    // FamPay / standard UPI UTR
    /(?:UTR|UPI\s*(?:Ref|Reference)(?:\s*(?:No|Number))?|Ref\s*(?:No|Number)?|RRN|Txn\s*ID|Transaction\s*ID)[:\s#-]*([0-9]{12})/i,
    /(?:UTR|UPI\s*(?:Ref|Reference))[:\s#-]*([A-Za-z0-9]{12,24})/i,
    // NEW: Slice-specific transaction reference patterns
    /(?:Transaction\s*(?:ID|No|Number)|Txn\s*(?:ID|No)|Reference\s*(?:ID|No)|Ref\s*No|RRN|UTR)[:\s#-]*([A-Za-z0-9]{8,24})/i,
  ];

  for (const pat of labeledPatterns) {
    const match = text.match(pat);
    if (match && match[1]) {
      const candidate = match[1].trim();
      if (/^\d{12}$/.test(candidate)) {
        return candidate;
      }
      if (/^[A-Za-z0-9]{12,24}$/.test(candidate)) {
        return candidate;
      }
      // NEW: Slice refs can be 8+ alphanumeric
      if (/^[A-Za-z0-9]{8,24}$/.test(candidate)) {
        return candidate;
      }
    }
  }

  // Secondary check: standalone 12-digit numeric reference near transaction context
  const lines = text.split('\n');
  for (const line of lines) {
    if (/(?:ref|utr|upi|txn|bank|transfer|id)/i.test(line)) {
      const numMatch = line.match(/\b([0-9]{12})\b/);
      if (numMatch && numMatch[1]) {
        return numMatch[1];
      }
    }
  }

  return null;
}

/**
 * Extracts FamApp/FamPay transaction ID if present
 */
export function extractFamPayTxnId(text: string): string | null {
  const match = text.match(
    /(?:with\s+transaction\s+id|transaction\s*id|FamPay\s*(?:Txn|ID|Ref)|Order\s*ID)[:\s#-]*([A-Za-z0-9_-]{6,30})/i
  );
  return match && match[1] ? match[1].trim() : null;
}

/**
 * Extracts payer name if present
 */
export function extractPayerName(text: string): string | null {
  const match = text.match(/from\s+([A-Za-z\s]{2,40}?)\s+at\s+\d{1,2}:\d{2}/i);
  return match && match[1] ? match[1].trim() : null;
}

/**
 * Extracts payer VPA/UPI ID if present
 */
export function extractPayerVpa(text: string): string | null {
  const match = text.match(/(?:from|by|payer|vpa)[:\s]*([a-zA-Z0-9._-]+@[a-zA-Z0-9]+)/i);
  return match && match[1] ? match[1].trim().toLowerCase() : null;
}

/**
 * Extracts order reference or FlixVault order ID (FLX-...) if present
 */
export function extractOrderReference(text: string): string | null {
  if (!text) return null;
  const flxMatch = text.match(/\b(FLX-[A-Za-z0-9]+-\d+)\b/i);
  if (flxMatch && flxMatch[1]) {
    return flxMatch[1].toUpperCase();
  }
  const refMatch = text.match(
    /(?:Order\s*ID|Order\s*Ref|Ref\s*ID|Payment\s*Ref|Order\s*Number)[:\s#-]*([A-Za-z0-9_-]{6,30})/i
  );
  if (refMatch && refMatch[1]) {
    return refMatch[1].trim();
  }
  return null;
}

/**
 * Main diagnostic parser for FamPay / FamApp / Slice payment alert emails
 */
export function parsePaymentAlert(
  email: EmailPayload,
  configuredSender?: string
): FamPayDiagnosticResult {
  const senderAddress = extractEmailAddress(email.from || '');
  const subject = (email.subject || '').trim();
  const textBody = email.text || (email.html ? stripHtml(email.html) : '');
  const combinedText = `${subject}\n${textBody}`;

  const isVerified = isSenderVerified(senderAddress, configuredSender);
  const provider = detectProvider(senderAddress);

  // NEW: Include slice in candidate detection
  const isCandidate =
    isVerified ||
    senderAddress.includes('famapp') ||
    senderAddress.includes('fampay') ||
    senderAddress.includes('slice.bank') ||
    subject.toLowerCase().includes('famapp') ||
    subject.toLowerCase().includes('fampay') ||
    subject.toLowerCase().includes('famx') ||
    subject.toLowerCase().includes('slice account') ||
    textBody.toLowerCase().includes('famapp') ||
    textBody.toLowerCase().includes('fampay') ||
    textBody.toLowerCase().includes('famx') ||
    textBody.toLowerCase().includes('slice account');

  const detectedStatus = detectPaymentStatus(combinedText, subject);
  const detectedAmount = extractAmount(combinedText);
  const detectedUtr = extractUtr(combinedText);
  const fampayTxnId = extractFamPayTxnId(combinedText);
  const detectedOrderRef = extractOrderReference(combinedText);
  const payerVpa = extractPayerVpa(combinedText);
  const payerName = extractPayerName(combinedText);

  let detectedTimestamp: string | null = null;
  if (email.date) {
    const d = new Date(email.date);
    if (!isNaN(d.getTime())) {
      detectedTimestamp = d.toISOString();
    }
  }

  const missingFields: string[] = [];
  const limitations: string[] = [];

  if (!isVerified) {
    limitations.push(
      `Sender "${senderAddress || 'unknown'}" is not in the verified sender allowlist (FamApp/FamPay/Slice). Unverified emails must be ignored.`
    );
  }

  if (detectedStatus !== 'SUCCESS') {
    if (detectedStatus === 'FAILED' || detectedStatus === 'REFUND') {
      limitations.push(
        `Payment status detected as ${detectedStatus}. Non-successful transactions must not be processed.`
      );
    } else {
      missingFields.push('success_status');
      limitations.push('Payment success status could not be unambiguously verified from email content.');
    }
  }

  if (!detectedAmount) {
    missingFields.push('amount');
    limitations.push('Payable amount could not be extracted or is formatted ambiguously.');
  }

  if (!detectedUtr) {
    missingFields.push('utr');
    limitations.push(
      '12-digit UTR or transaction reference was not found in the email content.'
    );
    // NEW: Slice fallback note — paymentVerifier may verify by amount+time if only 1 pending order
    if (provider === 'slice') {
      limitations.push(
        'Slice emails often lack UTR. Verification may fall back to amount + time-window matching if exactly one matching pending order exists.'
      );
    }
  }

  let parseConfidence: ParseConfidence = 'UNRECOGNIZED';
  if (!isVerified) {
    parseConfidence = 'UNRECOGNIZED';
  } else if (detectedStatus === 'SUCCESS' && detectedAmount && detectedUtr) {
    parseConfidence = 'HIGH';
  } else if (detectedStatus === 'SUCCESS' && detectedAmount && provider === 'slice') {
    // NEW: Slice can be HIGH/MEDIUM even without UTR (amount + time fallback)
    parseConfidence = 'MEDIUM';
    limitations.push(
      'Slice email recognized, but UTR missing. Verification will use amount + time-window matching with single-pending-order safeguard.'
    );
  } else if (detectedAmount || detectedUtr) {
    parseConfidence = 'MEDIUM';
    limitations.push(
      'Email format partially recognized, but required fields are missing.'
    );
  } else {
    parseConfidence = 'UNRECOGNIZED';
    limitations.push(
      'Email structure does not match recognizable payment alert schema. Cannot accept unrecognized email.'
    );
  }

  return {
    isFamPayCandidate: isCandidate,
    isVerifiedSender: isVerified,
    senderAddress,
    subject,
    detectedStatus,
    detectedAmount,
    detectedUtr,
    detectedTimestamp,
    payerVpa,
    payerName,
    fampayTxnId,
    detectedOrderRef,
    parseConfidence,
    missingFields,
    limitations,
    detectedProvider: provider,
  };
}
