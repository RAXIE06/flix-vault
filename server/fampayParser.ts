/**
 * FamPay Email Alert Diagnostic Parser
 * 
 * Implements strict, defensive parsing of incoming payment alerts.
 * Adheres to Phase 3 / 3A safety requirements:
 * - Does not assume unvalidated formats.
 * - Extracts sender, status, amount, currency, UTR, and timestamp.
 * - Enforces verified sender allowlist.
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
 * Checks if sender matches configured verified FamPay senders
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

  // If user explicitly configured a verified sender in env
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
        (allowed === 'no-replay@famapp.in' && (normalized === 'no-reply@famapp.in' || normalized === 'no-replay@famapp.in'))
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
 */
export function detectPaymentStatus(text: string, subject: string): PaymentDetectedStatus {
  const combined = `${subject} ${text}`.toLowerCase();

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

  // Explicit success signals
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
  // Regex patterns matching Indian rupee formats
  // e.g. ₹149.38, Rs. 149.38, Rs 149.38, INR 149.38, received ₹149.38
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
        // Validate at most 2 decimal places
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
 * Extracts standard 12-digit UPI UTR or payment reference
 */
export function extractUtr(text: string): string | null {
  // Standard NPCI UPI UTR is 12 digits e.g. 428612345678
  // Look for labeled UTR first
  const labeledPatterns: RegExp[] = [
    /(?:UTR|UPI\s*(?:Ref|Reference)(?:\s*(?:No|Number))?|Ref\s*(?:No|Number)?|RRN|Txn\s*ID|Transaction\s*ID)[:\s#-]*([0-9]{12})/i,
    /(?:UTR|UPI\s*(?:Ref|Reference))[:\s#-]*([A-Za-z0-9]{12,24})/i,
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
    }
  }

  // Secondary check: look for standalone 12-digit numeric reference
  // only if near transaction context
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
 * e.g. "with transaction id FMPIB6783525504" -> "FMPIB6783525504"
 */
export function extractFamPayTxnId(text: string): string | null {
  const match = text.match(/(?:with\s+transaction\s+id|transaction\s*id|FamPay\s*(?:Txn|ID|Ref)|Order\s*ID)[:\s#-]*([A-Za-z0-9_-]{6,30})/i);
  return match && match[1] ? match[1].trim() : null;
}

/**
 * Extracts payer name if present
 * e.g. "from NITISH KUMAR at 04:55 PM IST" -> "NITISH KUMAR"
 */
export function extractPayerName(text: string): string | null {
  const match = text.match(/from\s+([A-Za-z\s]{2,40}?)\s+at\s+\d{1,2}:\d{2}/i);
  return match && match[1] ? match[1].trim() : null;
}

/**
 * Extracts payer VPA/UPI ID if present in the text
 */
export function extractPayerVpa(text: string): string | null {
  const match = text.match(/(?:from|by|payer|vpa)[:\s]*([a-zA-Z0-9._-]+@[a-zA-Z0-9]+)/i);
  return match && match[1] ? match[1].trim().toLowerCase() : null;
}

/**
 * Extracts order reference or FlixVault order ID (FLX-...) if present in alert text
 */
export function extractOrderReference(text: string): string | null {
  if (!text) return null;
  // Match FlixVault format: FLX-[A-Za-z0-9]+-[0-9]+
  const flxMatch = text.match(/\b(FLX-[A-Za-z0-9]+-\d+)\b/i);
  if (flxMatch && flxMatch[1]) {
    return flxMatch[1].toUpperCase();
  }
  // Generic order reference labels
  const refMatch = text.match(/(?:Order\s*ID|Order\s*Ref|Ref\s*ID|Payment\s*Ref|Order\s*Number)[:\s#-]*([A-Za-z0-9_-]{6,30})/i);
  if (refMatch && refMatch[1]) {
    return refMatch[1].trim();
  }
  return null;
}

/**
 * Main diagnostic parser for FamPay / FamApp payment alert emails
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
  const isCandidate =
    isVerified ||
    senderAddress.includes('famapp') ||
    senderAddress.includes('fampay') ||
    subject.toLowerCase().includes('famapp') ||
    subject.toLowerCase().includes('fampay') ||
    subject.toLowerCase().includes('famx') ||
    textBody.toLowerCase().includes('famapp') ||
    textBody.toLowerCase().includes('fampay') ||
    textBody.toLowerCase().includes('famx');

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

  // Calculate missing fields & limitations
  const missingFields: string[] = [];
  const limitations: string[] = [];

  if (!isVerified) {
    limitations.push(
      `Sender "${senderAddress || 'unknown'}" is not in the verified FamPay sender allowlist. Unverified emails must be ignored.`
    );
  }

  if (detectedStatus !== 'SUCCESS') {
    if (detectedStatus === 'FAILED' || detectedStatus === 'REFUND') {
      limitations.push(`Payment status detected as ${detectedStatus}. Non-successful transactions must not be processed.`);
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
    limitations.push('12-digit UTR or transaction reference was not found in the email content.');
  }

  // Confidence determination
  let parseConfidence: ParseConfidence = 'UNRECOGNIZED';
  if (!isVerified) {
    parseConfidence = 'UNRECOGNIZED';
  } else if (detectedStatus === 'SUCCESS' && detectedAmount && detectedUtr) {
    parseConfidence = 'HIGH';
  } else if (detectedAmount || detectedUtr) {
    parseConfidence = 'MEDIUM';
    limitations.push(
      'Email format partially recognized, but required fields are missing. Live automated payment verification requires a genuine, redacted FamPay payment alert sample.'
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
  };
}
