import {
  parsePaymentAlert,
  isSenderVerified,
  extractEmailAddress,
  detectPaymentStatus,
  extractAmount,
  extractUtr,
  stripHtml,
} from '../server/fampayParser';
import { maskEmail, getSafeGmailConfigStatus } from '../server/gmail';

console.log('🧪 ============================================================');
console.log('🧪 FlixVault Phase 3A: Gmail IMAP & FamPay Parser Test Suite');
console.log('🧪 ============================================================\n');

let totalTests = 0;
let passedTests = 0;

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
// Test Group 1: Safe Configuration & Email Masking
// -----------------------------------------------------------------------------
console.log('1. Testing Safe Configuration & Email Masking:');

const masked1 = maskEmail('myflixalerts@gmail.com');
assert(masked1.includes('***') && masked1.endsWith('@gmail.com'), 'Masks intermediate email characters');
assert(!masked1.includes('myflixalerts'), 'Does not leak full local username in masked output');

const maskedShort = maskEmail('ab@gmail.com');
assert(maskedShort.includes('***@gmail.com'), 'Handles short email handles safely');

const status = getSafeGmailConfigStatus();
assert(typeof status.configured === 'boolean', 'Config status reports configured boolean');
assert(status.phase.includes('Phase 3A'), 'Confirms Phase 3A active state');
assert(status.autoVerificationActive === false, 'Strictly asserts autoVerificationActive is false in Phase 3A');
assert(!('appPassword' in (status as any)), 'Ensures appPassword is never exposed in status object');

// -----------------------------------------------------------------------------
// Test Group 2: Sender Verification & Normalization
// -----------------------------------------------------------------------------
console.log('\n2. Testing Sender Verification & Normalization:');

assert(
  extractEmailAddress('FamPay <alerts@fampay.in>') === 'alerts@fampay.in',
  'Extracts normalized address from RFC2822 header "FamPay <alerts@fampay.in>"'
);
assert(
  extractEmailAddress('alerts@fampay.in') === 'alerts@fampay.in',
  'Extracts address from plain string'
);

assert(isSenderVerified('alerts@fampay.in'), 'Verifies official FamPay sender alerts@fampay.in');
assert(isSenderVerified('payments@fampay.in'), 'Verifies payments@fampay.in');
assert(isSenderVerified('notifications@fampay.club'), 'Verifies @fampay.club domain');
assert(!isSenderVerified('attacker@gmail.com'), 'Strictly rejects untrusted Gmail sender');
assert(!isSenderVerified('fampay.fake@phishing.net'), 'Strictly rejects phishing domain spoofing fampay');
assert(!isSenderVerified(''), 'Rejects empty sender');

// Custom allowlist pattern and FamApp alias handling
assert(
  isSenderVerified('custom@partner.in', 'custom@partner.in,alerts@fampay.in'),
  'Supports custom GMAIL_VERIFIED_SENDER allowlist'
);
assert(
  isSenderVerified('no-reply@famapp.in', 'no-replay@famapp.in'),
  'Verifies no-reply@famapp.in when GMAIL_VERIFIED_SENDER=no-replay@famapp.in'
);
assert(
  isSenderVerified('no-replay@famapp.in', 'no-replay@famapp.in'),
  'Verifies no-replay@famapp.in when GMAIL_VERIFIED_SENDER=no-replay@famapp.in'
);
assert(
  isSenderVerified('no-reply@famapp.in'),
  'Verifies official FamApp sender no-reply@famapp.in by default'
);

// -----------------------------------------------------------------------------
// Test Group 3: Payment Status Detection
// -----------------------------------------------------------------------------
console.log('\n3. Testing Payment Status Detection:');

assert(
  detectPaymentStatus('You have received ₹149.38', 'Payment Received') === 'SUCCESS',
  'Detects SUCCESS on "Payment Received" and "received ₹"'
);
assert(
  detectPaymentStatus('Amount has been credited to your account', 'Credit Alert') === 'SUCCESS',
  'Detects SUCCESS on "credited to your account"'
);
assert(
  detectPaymentStatus('Transaction failed due to bank timeout', 'Payment Failed') === 'FAILED',
  'Detects FAILED on failed transaction'
);
assert(
  detectPaymentStatus('The payment of ₹149.38 was declined by issuer', 'Declined') === 'FAILED',
  'Detects FAILED on declined payment'
);
assert(
  detectPaymentStatus('Refund of ₹149.38 has been processed', 'Refund Notice') === 'REFUND',
  'Detects REFUND and does not confuse with successful credit'
);
assert(
  detectPaymentStatus('Payment is currently pending confirmation', 'Payment Status') === 'PENDING',
  'Detects PENDING status'
);
assert(
  detectPaymentStatus('Welcome to your newsletter', 'Weekly Digest') === 'UNKNOWN',
  'Returns UNKNOWN for unrelated email'
);

// -----------------------------------------------------------------------------
// Test Group 4: Exact Amount & Integer Paise Conversion
// -----------------------------------------------------------------------------
console.log('\n4. Testing Amount Extraction & Integer Paise Normalization:');

const amt1 = extractAmount('You received ₹149.38 from customer');
assert(amt1 !== null && amt1.amountInRupees === 149.38 && amt1.amountInPaise === 14938, 'Extracts ₹149.38 with exact 14938 paise');

const amt2 = extractAmount('INR 299.00 credited to your account');
assert(amt2 !== null && amt2.amountInRupees === 299 && amt2.amountInPaise === 29900, 'Extracts INR 299.00 with exact 29900 paise');

const amt3 = extractAmount('Amount: Rs. 149.25');
assert(amt3 !== null && amt3.amountInRupees === 149.25 && amt3.amountInPaise === 14925, 'Extracts Rs. 149.25 with exact 14925 paise');

const amtNoMatch = extractAmount('Hello world, your code is 884920');
assert(amtNoMatch === null, 'Does not misidentify random integer numbers as currency amount');

// -----------------------------------------------------------------------------
// Test Group 5: 12-digit UPI UTR / Reference Extraction
// -----------------------------------------------------------------------------
console.log('\n5. Testing 12-digit UPI UTR Extraction:');

const utr1 = extractUtr('UPI Ref No: 428691827364 completed successfully');
assert(utr1 === '428691827364', 'Extracts 12-digit UTR labeled with "UPI Ref No"');

const utr2 = extractUtr('Transaction Details:\nUTR: 428612345678\nStatus: SUCCESS');
assert(utr2 === '428612345678', 'Extracts 12-digit UTR labeled with "UTR:"');

const utr3 = extractUtr('Bank Reference (RRN): 428699998888');
assert(utr3 === '428699998888', 'Extracts 12-digit RRN reference');

const utrMissing = extractUtr('Payment received. No reference details available yet.');
assert(utrMissing === null, 'Returns null when no valid UTR reference exists');

// -----------------------------------------------------------------------------
// Test Group 6: Diagnostic Parser Synthetic Fixtures
// -----------------------------------------------------------------------------
console.log('\n6. Testing End-to-End Diagnostic Parser on Synthetic Fixtures:');

// Fixture A: Authentic-style FamPay payment alert
const fixtureSuccess = parsePaymentAlert({
  from: 'FamPay Alerts <alerts@fampay.in>',
  subject: 'Payment Received: ₹149.38 credited to your account',
  text: `Hi Merchant,\n\nYou have received a payment of ₹149.38 from user@okhdfcbank.\n\nTransaction Details:\nAmount: ₹149.38\nStatus: SUCCESS\nUPI Reference / UTR: 428691827364\nDate: 2026-10-13T12:00:00Z`,
  date: '2026-10-13T12:00:00Z',
});

assert(fixtureSuccess.isFamPayCandidate === true, 'Fixture A recognized as FamPay candidate');
assert(fixtureSuccess.isVerifiedSender === true, 'Fixture A verified sender alerts@fampay.in');
assert(fixtureSuccess.detectedStatus === 'SUCCESS', 'Fixture A status is SUCCESS');
assert(fixtureSuccess.detectedAmount?.amountInPaise === 14938, 'Fixture A amount is 14938 paise');
assert(fixtureSuccess.detectedUtr === '428691827364', 'Fixture A UTR matches 428691827364');
assert(fixtureSuccess.parseConfidence === 'HIGH', 'Fixture A achieves HIGH parse confidence');
assert(fixtureSuccess.missingFields.length === 0, 'Fixture A has zero missing fields');

// Fixture Real FamApp Alert (exact structure from live FamApp UID 2543)
const fixtureRealFamApp = parsePaymentAlert(
  {
    from: 'FamApp <no-reply@famapp.in>',
    subject: 'You received ₹99.98 in your FamX account',
    date: '2026-10-13T11:25:10.000Z',
    text: 'Hey Manish Kumar, You have successfully received ₹99.98 from NITISH KUMAR at 04:55 PM IST, 13 October 2026 with transaction id FMPIB6783525504. Your updated balance is ₹99.98. UTR: 165422408474. If this was not done by you, report this transaction at fraud-reporting@famapp.in',
  },
  'no-replay@famapp.in'
);

assert(fixtureRealFamApp.isFamPayCandidate === true, 'Real FamApp alert recognized as FamApp/FamPay candidate');
assert(fixtureRealFamApp.isVerifiedSender === true, 'Real FamApp alert verified against no-replay@famapp.in allowlist');
assert(fixtureRealFamApp.detectedStatus === 'SUCCESS', 'Real FamApp status is SUCCESS');
assert(fixtureRealFamApp.detectedAmount?.amountInRupees === 99.98, 'Real FamApp amount extracted as ₹99.98');
assert(fixtureRealFamApp.detectedAmount?.amountInPaise === 9998, 'Real FamApp amount converted to 9998 integer paise');
assert(fixtureRealFamApp.detectedUtr === '165422408474', 'Real FamApp UTR matches 165422408474');
assert(fixtureRealFamApp.fampayTxnId === 'FMPIB6783525504', 'Real FamApp transaction ID matches FMPIB6783525504');
assert(fixtureRealFamApp.payerName === 'NITISH KUMAR', 'Real FamApp payer name matches NITISH KUMAR');
assert(fixtureRealFamApp.detectedTimestamp === '2026-10-13T11:25:10.000Z', 'Real FamApp timestamp extracted accurately');
assert(fixtureRealFamApp.parseConfidence === 'HIGH', 'Real FamApp alert achieves HIGH parse confidence');
assert(fixtureRealFamApp.missingFields.length === 0, 'Real FamApp alert has 0 missing fields');
assert(fixtureRealFamApp.limitations.length === 0, 'Real FamApp alert has 0 limitations');

// Fixture B: Failed FamPay alert
const fixtureFailed = parsePaymentAlert({
  from: 'alerts@fampay.in',
  subject: 'Transaction Failed: ₹149.38 could not be completed',
  text: 'The payment of ₹149.38 has failed. UTR: 428691827364. Status: FAILED.',
});

assert(fixtureFailed.detectedStatus === 'FAILED', 'Fixture B detected status as FAILED');
assert(
  fixtureFailed.limitations.some((l) => l.includes('Non-successful transactions')),
  'Fixture B flags limitation that non-successful transactions cannot be processed'
);

// Fixture C: Unverified sender phishing attempt
const fixtureUnverified = parsePaymentAlert({
  from: 'imposter@unverifieddomain.org',
  subject: 'Payment Received: ₹149.38 credited',
  text: 'Credited ₹149.38. UTR: 428691827364.',
});

assert(fixtureUnverified.isVerifiedSender === false, 'Fixture C marks sender as unverified');
assert(fixtureUnverified.parseConfidence === 'UNRECOGNIZED', 'Fixture C receives UNRECOGNIZED confidence');
assert(
  fixtureUnverified.limitations.some((l) => l.includes('unverified')),
  'Fixture C explicitly flags unverified sender limitation'
);

// Fixture D: Incomplete alert (Missing UTR)
const fixtureIncomplete = parsePaymentAlert({
  from: 'alerts@fampay.in',
  subject: 'Payment received: ₹149.38',
  text: 'Payment of ₹149.38 has been received. Thank you.',
});

assert(fixtureIncomplete.missingFields.includes('utr'), 'Fixture D reports missing UTR');
assert(fixtureIncomplete.parseConfidence !== 'HIGH', 'Fixture D does not receive HIGH confidence when UTR is missing');
assert(
  fixtureIncomplete.limitations.some((l) => l.includes('UTR')),
  'Fixture D reports limitation requiring real sample alert for missing fields'
);

// Fixture E: Arbitrary spam email
const fixtureSpam = parsePaymentAlert({
  from: 'newsletter@store.com',
  subject: 'Exclusive discounts this weekend!',
  text: 'Check out our products starting at just $10.',
});

assert(fixtureSpam.isFamPayCandidate === false, 'Fixture E rejected as candidate');
assert(fixtureSpam.parseConfidence === 'UNRECOGNIZED', 'Fixture E confidence is UNRECOGNIZED');

console.log('\n============================================================');
console.log(`Results: ${passedTests}/${totalTests} tests passed.`);
console.log('============================================================\n');
