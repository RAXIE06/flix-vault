/**
 * Standards-compliant UPI (Unified Payments Interface) URI & VPA utilities
 * Based on NPCI UPI Linking Specifications.
 */

export interface UpiUriParams {
  pa: string; // Payee VPA / UPI ID (e.g. merchant@okaxis)
  pn: string; // Payee Name (e.g. FlixVault Cinema)
  am: number; // Exact amount (e.g. 149.25)
  cu?: string; // Currency code, strictly INR
  tn?: string; // Transaction Note (max 80 chars)
  tr?: string; // Transaction Reference ID / Order ID (max 35 chars)
}

export interface UpiVpaValidationResult {
  isValid: boolean;
  error?: string;
  vpa?: string;
}

const KNOWN_PLACEHOLDERS = new Set([
  'placeholder@upi',
  'yourname@upi',
  'your-name@upi',
  'example@upi',
  'user@bank',
  'name@upi',
  'test@upi',
]);

/**
 * Validates a UPI Virtual Payment Address (VPA).
 * Ensures it contains a single '@', valid handle and PSP characters,
 * and is not empty or a generic placeholder.
 */
export function validateUpiVpa(vpa: unknown): UpiVpaValidationResult {
  if (vpa === undefined || vpa === null || typeof vpa !== 'string') {
    return {
      isValid: false,
      error:
        'UPI VPA is not configured. A valid UPI ID (e.g. yourname@okhdfcbank or merchant@paytm) must be set in server environment (UPI_VPA) or Admin Settings.',
    };
  }

  const trimmed = vpa.trim();
  if (!trimmed) {
    return {
      isValid: false,
      error: 'UPI VPA is empty. Please configure a valid UPI ID.',
    };
  }

  const parts = trimmed.split('@');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return {
      isValid: false,
      error: `Invalid UPI VPA format "${trimmed}". A valid UPI ID must follow the username@bank format (e.g. merchant@okaxis).`,
    };
  }

  const [username, provider] = parts;
  // Standard NPCI VPA characters: letters, digits, dots, hyphens, underscores
  const handleRegex = /^[a-zA-Z0-9.\-_]{2,64}$/;
  const providerRegex = /^[a-zA-Z0-9.\-_]{2,32}$/;

  if (!handleRegex.test(username) || !providerRegex.test(provider)) {
    return {
      isValid: false,
      error: `UPI VPA "${trimmed}" contains invalid characters. UPI IDs must contain only letters, numbers, dots, hyphens, and underscores.`,
    };
  }

  if (KNOWN_PLACEHOLDERS.has(trimmed.toLowerCase())) {
    return {
      isValid: false,
      error: `UPI VPA is currently set to placeholder "${trimmed}". Please set your real UPI ID in server configuration or the Admin Dashboard.`,
    };
  }

  return {
    isValid: true,
    vpa: trimmed,
  };
}

/**
 * Builds a standards-compliant UPI payment intent URI according to NPCI specifications:
 * upi://pay?pa=...&pn=...&am=...&cu=INR&tn=...&tr=...
 *
 * Critical fixes:
 * 1. Payee VPA ('pa') MUST retain literal '@' (not encoded as '%40'). Many UPI scanners
 *    regex-match '^upi:\/\/pay\?.*pa=[^@]+@[^&]+' and fail with "Invalid QR Code" if '%40' is used.
 * 2. 'am' MUST be a clean decimal INR amount (e.g. '149.25') with no currency symbols or thousands separators.
 * 3. 'cu' MUST be 'INR'.
 * 4. 'pn' MUST be properly encoded.
 * 5. 'tr' MUST be included for dynamic payment references (order ID).
 * 6. 'tn' MUST be cleanly encoded, avoiding forbidden punctuation.
 */
export function buildUpiPaymentUri(params: UpiUriParams): string {
  // 1. Validate VPA
  const vpaResult = validateUpiVpa(params.pa);
  if (!vpaResult.isValid || !vpaResult.vpa) {
    throw new Error(vpaResult.error || 'Invalid UPI VPA');
  }
  const cleanVpa = vpaResult.vpa;

  // 2. Format and validate Amount (exact decimal, positive)
  if (typeof params.am !== 'number' || isNaN(params.am) || params.am <= 0) {
    throw new Error(`Invalid payable amount: ${params.am}. Amount must be a positive number.`);
  }
  const formattedAmount = params.am.toFixed(2);

  // 3. Payee Name (max 50 chars, trimmed)
  const cleanPayeeName = (params.pn || 'FlixVault Cinema').trim().slice(0, 50);

  // 4. Currency: strictly INR
  const currency = (params.cu || 'INR').trim().toUpperCase();
  if (currency !== 'INR') {
    throw new Error(`Invalid currency "${currency}". UPI only supports INR.`);
  }

  // 5. Transaction Reference ID (Order ID): max 35 chars, alphanumeric with - and _
  const rawTr = (params.tr || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 35);

  // 6. Transaction Note: max 80 chars, clean characters
  const rawTn = (params.tn || `FlixVault Order ${rawTr}`).trim().replace(/[^a-zA-Z0-9\s_-]/g, '').slice(0, 80);

  // Construct URI query components
  // Note: Literal '@' is kept in 'pa' per NPCI UPI standard specifications
  const queryParts: string[] = [
    `pa=${cleanVpa}`,
    `pn=${encodeURIComponent(cleanPayeeName)}`,
    `am=${formattedAmount}`,
    `cu=${currency}`,
    `tn=${encodeURIComponent(rawTn)}`,
  ];

  if (rawTr) {
    queryParts.push(`tr=${encodeURIComponent(rawTr)}`);
  }

  return `upi://pay?${queryParts.join('&')}`;
}

/**
 * Safely masks a UPI VPA for logging and diagnostics (e.g. "fl***lt@upi")
 */
export function maskUpiVpa(vpa: string): string {
  if (!vpa || !vpa.includes('@')) return '***@***';
  const [user, domain] = vpa.split('@');
  if (user.length <= 2) {
    return `${user[0]}*@${domain}`;
  }
  const start = user.slice(0, 2);
  const end = user.slice(-2);
  return `${start}***${end}@${domain}`;
}

/**
 * Masks sensitive parts of a UPI URI for safe logging and client diagnostic display
 */
export function maskUpiUri(uri: string): string {
  try {
    const url = new URL(uri);
    const pa = url.searchParams.get('pa');
    if (pa) {
      url.searchParams.set('pa', maskUpiVpa(pa));
    }
    return url.toString();
  } catch {
    return uri.replace(/pa=[^&]+/, 'pa=***@***');
  }
}

/**
 * Resolves UPI configuration with intelligent validation.
 * If UPI_VPA and UPI_PAYEE_NAME were accidentally swapped in environment or admin input
 * (e.g. payee name has no '@', but UPI ID was typed in the payee name field),
 * this detects and safely corrects the mapping while logging a diagnostic warning.
 */
export function resolveUpiConfig(
  rawVpa?: string,
  rawPayeeName?: string
): {
  upiVpa: string;
  payeeName: string;
  swappedDetected: boolean;
} {
  let upiVpa = (rawVpa || '').trim();
  let payeeName = (rawPayeeName || 'FlixVault Cinema').trim();

  const vpaValid = validateUpiVpa(upiVpa).isValid;
  const payeeIsVpa = validateUpiVpa(payeeName).isValid;

  if (!vpaValid && payeeIsVpa) {
    console.warn(
      `⚠️ [FlixVault UPI] Detected inverted configuration: VPA was set to "${upiVpa}" and Payee Name was set to "${payeeName}". Automatically mapping VPA to "${payeeName}" and Payee Name to "${upiVpa}".`
    );
    const temp = upiVpa;
    upiVpa = payeeName;
    payeeName = temp || 'FlixVault Cinema';
    return { upiVpa, payeeName, swappedDetected: true };
  }

  return { upiVpa, payeeName, swappedDetected: false };
}

