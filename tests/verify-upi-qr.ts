import { buildUpiPaymentUri, validateUpiVpa, maskUpiVpa, maskUpiUri } from '../server/upi';
import QRCode from 'qrcode';
import jsQR from 'jsqr';

console.log('🧪 ============================================================');
console.log('🧪 FlixVault UPI QR Standards & Round-Trip Verification Test');
console.log('🧪 ============================================================\n');

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`✅ [PASS] ${testName}`);
  } else {
    console.error(`❌ [FAIL] ${testName}${detail ? ` - ${detail}` : ''}`);
    process.exitCode = 1;
  }
}

// -----------------------------------------------------------------------------
// Test 1: VPA Validator
// -----------------------------------------------------------------------------
console.log('1. Testing UPI VPA Validation:');

const emptyVpa = validateUpiVpa('');
assert(!emptyVpa.isValid, 'Rejects empty VPA');

const nullVpa = validateUpiVpa(null);
assert(!nullVpa.isValid, 'Rejects null/undefined VPA without silent fallback');

const noAtVpa = validateUpiVpa('merchantatbank');
assert(!noAtVpa.isValid, 'Rejects VPA without @ sign');

const placeholderVpa = validateUpiVpa('yourname@upi');
assert(!placeholderVpa.isValid, 'Rejects placeholder "yourname@upi"');

const validVpa1 = validateUpiVpa('flixvault@upi');
assert(validVpa1.isValid && validVpa1.vpa === 'flixvault@upi', 'Accepts valid format "flixvault@upi"');

const validVpa2 = validateUpiVpa('merchant.cinema@okhdfcbank');
assert(validVpa2.isValid && validVpa2.vpa === 'merchant.cinema@okhdfcbank', 'Accepts valid format "merchant.cinema@okhdfcbank"');

// -----------------------------------------------------------------------------
// Test 2: Standards-Compatible UPI URI Generation
// -----------------------------------------------------------------------------
console.log('\n2. Testing Standards-Compatible UPI URI Generation:');

const testOrder = {
  pa: 'merchant.cinema@okhdfcbank',
  pn: 'FlixVault Cinema',
  am: 149.38,
  cu: 'INR',
  tn: 'FlixVault Order FLX-TEST-1234',
  tr: 'FLX-TEST-1234',
};

const generatedUri = buildUpiPaymentUri(testOrder);
console.log('Generated URI:\n', generatedUri);

assert(generatedUri.startsWith('upi://pay?'), 'URI starts with "upi://pay?"');
assert(generatedUri.includes('pa=merchant.cinema@okhdfcbank'), 'Payee VPA contains literal "@" (NOT "%40")');
assert(!generatedUri.includes('%40'), 'Payee VPA is NOT double-encoded or mangled with %40');
assert(generatedUri.includes('am=149.38'), 'Amount is formatted as exact decimal 149.38 without currency symbols');
assert(generatedUri.includes('cu=INR'), 'Currency is strictly INR');
assert(generatedUri.includes('tr=FLX-TEST-1234'), 'Includes mandatory Transaction Reference (tr) matching order ID');
assert(generatedUri.includes('pn=FlixVault%20Cinema'), 'Payee name is cleanly URL-encoded');
assert(generatedUri.includes('tn=FlixVault%20Order%20FLX-TEST-1234'), 'Transaction note is cleanly URL-encoded');

// -----------------------------------------------------------------------------
// Test 3: QR Code Matrix Generation & Scanning Round-Trip
// -----------------------------------------------------------------------------
console.log('\n3. Testing QR Code Generation and Scanner Optical Recovery:');

const qr = QRCode.create(generatedUri, { errorCorrectionLevel: 'M' });
const moduleCount = qr.modules.size;
const margin = 4; // ISO 18004 Quiet Zone
const totalSize = moduleCount + margin * 2;
const scale = 4;
const width = totalSize * scale;
const height = totalSize * scale;

const rgba = new Uint8ClampedArray(width * height * 4);
rgba.fill(255); // White background

for (let r = 0; r < moduleCount; r++) {
  for (let c = 0; c < moduleCount; c++) {
    if (qr.modules.get(r, c)) {
      const startX = (c + margin) * scale;
      const startY = (r + margin) * scale;
      for (let y = 0; y < scale; y++) {
        for (let x = 0; x < scale; x++) {
          const idx = ((startY + y) * width + (startX + x)) * 4;
          rgba[idx] = 0;
          rgba[idx + 1] = 0;
          rgba[idx + 2] = 0;
          rgba[idx + 3] = 255;
        }
      }
    }
  }
}

const decoded = jsQR(rgba, width, height);
assert(decoded !== null, 'jsQR successfully scanned and recognized QR pattern');
if (decoded) {
  assert(decoded.data === generatedUri, 'Decoded QR payload exactly matches generated URI character-for-character');

  const parsedUrl = new URL(decoded.data);
  assert(parsedUrl.searchParams.get('pa') === testOrder.pa, 'Decoded Payee VPA matches original');
  assert(parsedUrl.searchParams.get('pn') === testOrder.pn, 'Decoded Payee Name matches original');
  assert(parsedUrl.searchParams.get('am') === testOrder.am.toFixed(2), 'Decoded Amount matches exact decimal original');
  assert(parsedUrl.searchParams.get('cu') === 'INR', 'Decoded Currency is INR');
  assert(parsedUrl.searchParams.get('tr') === testOrder.tr, 'Decoded Order Reference (tr) matches original');
  assert(parsedUrl.searchParams.get('tn') === testOrder.tn, 'Decoded Transaction Note (tn) matches original');
}

// -----------------------------------------------------------------------------
// Test 4: Safe Development Diagnostics & Masking
// -----------------------------------------------------------------------------
console.log('\n4. Testing Safe Diagnostics & Masking:');

const maskedVpa = maskUpiVpa('merchant.cinema@okhdfcbank');
console.log('Masked VPA:', maskedVpa);
assert(maskedVpa.includes('***') && maskedVpa.endsWith('@okhdfcbank'), 'Masks middle characters of VPA');

const maskedUri = maskUpiUri(generatedUri);
console.log('Masked URI:\n', maskedUri);
assert(maskedUri.includes('pa=me***ma@okhdfcbank') || maskedUri.includes('***'), 'Masks VPA in URI sample');
assert(!maskedUri.includes('merchant.cinema@okhdfcbank'), 'Raw VPA handle is not leaked in masked sample');

console.log('\n============================================================');
console.log(`Results: ${passedTests}/${totalTests} tests passed.`);
console.log('============================================================\n');
