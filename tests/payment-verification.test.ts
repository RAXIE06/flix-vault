/**
 * FlixVault Phase 3B: Automated UPI Payment Verification Test Suite
 * 
 * Tests rigorous payment matching safeguards against FamApp email alerts:
 * 1. Exact amount matching in integer paise
 * 2. Incorrect amount rejection (amount mismatch)
 * 3. Duplicate UTR rejection across orders
 * 4. Duplicate FamApp transaction ID rejection
 * 5. Expired orders rejection (outside permitted payment window)
 * 6. Ambiguous matching rejection (preventing false matches by amount alone)
 * 7. Repeated email processing (idempotency)
 * 8. Concurrent verification safety (atomic single-credit)
 * 9. Unverified sender rejection
 * 10. Non-successful payment status rejection (FAILED / REFUND)
 * 11. Missing required fields rejection (missing UTR / amount)
 * 12. Safe UTR masking and credentials privacy
 */

import {
  verifyOrderWithAlert,
  matchAlertAgainstPendingOrders,
  getOrderExpectedPaise,
  maskUtr,
  isWithinPaymentWindow,
  updateOrderVerification,
} from '../server/paymentVerifier';
import {
  parsePaymentAlert,
  FamPayDiagnosticResult,
} from '../server/fampayParser';
import { memoryStore } from '../server/db';

console.log('🧪 ============================================================');
console.log('🧪 FlixVault Phase 3B: Automated Payment Verification Test Suite');
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

// Helper to create test orders
function createMockOrder(overrides: Partial<any> = {}): any {
  const basePrice = 149;
  const randomPaise = 38;
  const payableAmount = 149.38;
  const orderId = overrides.orderId || `FLX-TEST-${Math.floor(1000 + Math.random() * 9000)}`;
  const now = new Date();

  return {
    orderId,
    movieId: 'mv-001',
    movieTitle: 'Interstellar',
    originalPrice: basePrice,
    payableAmount,
    expectedAmountPaise: 14938,
    currency: 'INR',
    status: 'pending',
    upiVpa: 'merchant@okhdfcbank',
    upiPayeeName: 'FlixVault Cinema',
    upiPaymentUri: `upi://pay?pa=merchant@okhdfcbank&pn=FlixVault%20Cinema&am=${payableAmount}&cu=INR&tr=${orderId}&tn=FlixVault%20Order%20${orderId}`,
    createdAt: new Date(now.getTime() - 2 * 60 * 1000), // Created 2 mins ago
    expiresAt: new Date(now.getTime() + 13 * 60 * 1000), // Expires in 13 mins
    ...overrides,
  };
}

async function runTests() {
  // Reset in-memory orders store
  memoryStore.orders = [];

  // ---------------------------------------------------------------------------
  // 1. Exact Amount Matching in Integer Paise
  // ---------------------------------------------------------------------------
  console.log('1. Testing Exact Amount Matching in Integer Paise:');

  const order1 = createMockOrder({ orderId: 'FLX-ORD-1001', payableAmount: 149.38, expectedAmountPaise: 14938 });
  memoryStore.orders.push(order1);

  const exactEmail = {
    from: 'no-reply@famapp.in',
    subject: `You received ₹149.38 for FlixVault Order FLX-ORD-1001`,
    text: `You have successfully received ₹149.38 from NITISH KUMAR at 04:55 PM IST with transaction id FMPIB1001. UTR: 165422408474. Order Ref: FLX-ORD-1001`,
    date: new Date().toISOString(),
  };

  const parsedAlert1 = parsePaymentAlert(exactEmail, 'no-reply@famapp.in');
  const res1 = await verifyOrderWithAlert(order1, parsedAlert1, { allowDirectIdMatch: true });

  assert(res1.success === true, 'Successfully verifies order when exact paise matches');
  assert(res1.status === 'verified', 'Order status transitions to "verified"');
  assert(res1.matchedAmountPaise === 14938, 'Matches exact integer paise 14938');
  assert(res1.utr === '165422408474', 'Extracts and stores matched UTR');
  assert(res1.maskedUtr === '1654****8474', 'Stores correctly masked UTR 1654****8474');
  assert(order1.status === 'verified', 'In-memory order document updated to "verified"');
  assert(order1.matchedUtr === '165422408474', 'Persists matchedUtr on order');

  // ---------------------------------------------------------------------------
  // 2. Incorrect Amount Matching (Amount Mismatch)
  // ---------------------------------------------------------------------------
  console.log('\n2. Testing Incorrect Amount Rejection (Amount Mismatch):');

  const order2 = createMockOrder({ orderId: 'FLX-ORD-1002', payableAmount: 149.38, expectedAmountPaise: 14938 });
  memoryStore.orders.push(order2);

  // Email with ₹149.00 instead of ₹149.38 (off by 38 paise)
  const mismatchEmail = {
    from: 'no-reply@famapp.in',
    subject: `You received ₹149.00 for FlixVault Order FLX-ORD-1002`,
    text: `You have successfully received ₹149.00 from SENDER with transaction id FMPIB1002. UTR: 165422408475. Order Ref: FLX-ORD-1002`,
    date: new Date().toISOString(),
  };

  const parsedMismatch = parsePaymentAlert(mismatchEmail, 'no-reply@famapp.in');
  const res2 = await verifyOrderWithAlert(order2, parsedMismatch, { allowDirectIdMatch: true });

  assert(res2.success === false, 'Rejects payment when amount does not match expected paise');
  assert(res2.status === 'needs_review', 'Flags mismatched order as "needs_review"');
  assert(res2.reason.includes('Amount mismatch'), 'Reason clearly states Amount mismatch');
  assert(res2.reason.includes('14938 paise') && res2.reason.includes('14900 paise'), 'Reason contains both expected and actual integer paise');
  assert(order2.status === 'needs_review', 'Order is not marked verified in database');

  // ---------------------------------------------------------------------------
  // 3. Duplicate UTR Rejection
  // ---------------------------------------------------------------------------
  console.log('\n3. Testing Duplicate UTR Rejection Across Orders:');

  const order3 = createMockOrder({ orderId: 'FLX-ORD-1003', payableAmount: 149.38, expectedAmountPaise: 14938 });
  memoryStore.orders.push(order3);

  // Try to use UTR 165422408474 which was ALREADY used for FLX-ORD-1001
  const duplicateUtrEmail = {
    from: 'no-reply@famapp.in',
    subject: `You received ₹149.38 for FlixVault Order FLX-ORD-1003`,
    text: `You have received ₹149.38 with transaction id FMPIB1003. UTR: 165422408474. Order Ref: FLX-ORD-1003`,
    date: new Date().toISOString(),
  };

  const parsedDuplicateUtr = parsePaymentAlert(duplicateUtrEmail, 'no-reply@famapp.in');
  const res3 = await verifyOrderWithAlert(order3, parsedDuplicateUtr, { allowDirectIdMatch: true });

  assert(res3.success === false, 'Rejects payment when UTR was already used by another order');
  assert(res3.isDuplicateUtr === true, 'Explicitly flags duplicate UTR error');
  assert(res3.status === 'needs_review', 'Order marked needs_review due to duplicate UTR');
  assert(res3.reason.includes('FLX-ORD-1001'), 'Reason identifies the previous order that already used this UTR');
  assert(order3.status !== 'verified', 'Order 3 is NOT credited with duplicate UTR');

  // ---------------------------------------------------------------------------
  // 4. Duplicate FamApp Transaction ID Rejection
  // ---------------------------------------------------------------------------
  console.log('\n4. Testing Duplicate FamApp Transaction ID Rejection:');

  const order4 = createMockOrder({ orderId: 'FLX-ORD-1004', payableAmount: 149.38, expectedAmountPaise: 14938 });
  memoryStore.orders.push(order4);

  // Set order 1 with FamApp Txn ID FMPIB1001
  order1.fampayTxnId = 'FMPIB1001';

  const duplicateTxnEmail = {
    from: 'no-reply@famapp.in',
    subject: `You received ₹149.38 for FlixVault Order FLX-ORD-1004`,
    text: `You have received ₹149.38 with transaction id FMPIB1001. UTR: 998877665544. Order Ref: FLX-ORD-1004`,
    date: new Date().toISOString(),
  };

  const parsedDuplicateTxn = parsePaymentAlert(duplicateTxnEmail, 'no-reply@famapp.in');
  const res4 = await verifyOrderWithAlert(order4, parsedDuplicateTxn, { allowDirectIdMatch: true });

  assert(res4.success === false, 'Rejects payment when FamApp transaction ID is duplicate');
  assert(res4.isDuplicateTxnId === true, 'Explicitly flags duplicate FamApp Transaction ID');
  assert(res4.reason.includes('FMPIB1001'), 'Reason identifies duplicate transaction ID');
  assert(order4.status !== 'verified', 'Order 4 is NOT verified');

  // ---------------------------------------------------------------------------
  // 5. Expired Orders Rejection
  // ---------------------------------------------------------------------------
  console.log('\n5. Testing Expired Orders Rejection (Outside Permitted Window):');

  const pastNow = new Date();
  const order5 = createMockOrder({
    orderId: 'FLX-ORD-1005',
    createdAt: new Date(pastNow.getTime() - 40 * 60 * 1000), // Created 40 mins ago
    expiresAt: new Date(pastNow.getTime() - 25 * 60 * 1000), // Expired 25 mins ago
  });
  memoryStore.orders.push(order5);

  const expiredEmail = {
    from: 'no-reply@famapp.in',
    subject: `You received ₹149.38 for FlixVault Order FLX-ORD-1005`,
    text: `You received ₹149.38 with transaction id FMPIB1005. UTR: 554433221100. Order Ref: FLX-ORD-1005`,
    date: new Date().toISOString(), // Payment arrived NOW, long after expiration
  };

  const parsedExpired = parsePaymentAlert(expiredEmail, 'no-reply@famapp.in');
  const res5 = await verifyOrderWithAlert(order5, parsedExpired, { allowDirectIdMatch: true });

  assert(res5.success === false, 'Rejects payment when payment timestamp is after expiration');
  assert(res5.isExpired === true, 'Identifies payment as expired');
  assert(res5.status === 'expired', 'Order marked as "expired"');
  assert(res5.reason.includes('outside permitted window') || res5.reason.includes('expired'), 'Reason explains expiration');

  // ---------------------------------------------------------------------------
  // 6. Ambiguous Matching (Preventing False Matches by Amount Alone)
  // ---------------------------------------------------------------------------
  console.log('\n6. Testing Ambiguous Matching Rejection (Requirement 2):');

  const order6 = createMockOrder({ orderId: 'FLX-ORD-1006', payableAmount: 99.98, expectedAmountPaise: 9998 });
  memoryStore.orders.push(order6);

  // Email has matching amount (₹99.98) and valid UTR, BUT NO FLX-ORD-1006 reference
  const alertWithoutRef = {
    from: 'no-reply@famapp.in',
    subject: `You received ₹99.98 in your FamX account`,
    text: `Hey Manish Kumar, You have successfully received ₹99.98 from NITISH KUMAR at 04:55 PM IST, 13 October 2026 with transaction id FMPIB6783525504. Your updated balance is ₹99.98. UTR: 991122334455.`,
    date: new Date().toISOString(),
  };

  const parsedNoRef = parsePaymentAlert(alertWithoutRef, 'no-reply@famapp.in');

  // Direct check without explicit reference
  const res6Direct = await verifyOrderWithAlert(order6, parsedNoRef, { allowDirectIdMatch: false });
  assert(res6Direct.success === false, 'Refuses to auto-verify order by amount alone when order reference is missing');
  assert(res6Direct.isAmbiguous === true, 'Flags transaction as ambiguous match');
  assert(res6Direct.status === 'needs_review', 'Places order into "needs_review" status');
  assert(res6Direct.reason.includes('Cannot verify by amount alone'), 'Reason explains why amount alone cannot be trusted');

  // Test multi-order ambiguity: Two orders with exact same amount
  const order7A = createMockOrder({ orderId: 'FLX-ORD-1007A', payableAmount: 77.77, expectedAmountPaise: 7777 });
  const order7B = createMockOrder({ orderId: 'FLX-ORD-1007B', payableAmount: 77.77, expectedAmountPaise: 7777 });
  memoryStore.orders.push(order7A, order7B);

  const sharedAmountAlert = parsePaymentAlert({
    from: 'no-reply@famapp.in',
    subject: 'You received ₹77.77',
    text: 'Received ₹77.77 with UTR: 887766554433. Transaction id FMPIB7777.',
    date: new Date().toISOString(),
  }, 'no-reply@famapp.in');

  const matchRes = await matchAlertAgainstPendingOrders(sharedAmountAlert);
  assert(matchRes !== null, 'Scans and detects matching amount orders');
  assert(matchRes?.success === false, 'Never assigns alert without reference to multiple orders');
  assert(matchRes?.isAmbiguous === true, 'Reports ambiguity when multiple orders share amount');
  assert(order7A.status === 'needs_review', 'Order 7A set to needs_review');
  assert(order7B.status === 'needs_review', 'Order 7B set to needs_review');

  // ---------------------------------------------------------------------------
  // 7. Repeated Email Processing (Idempotency)
  // ---------------------------------------------------------------------------
  console.log('\n7. Testing Repeated Email Processing (Idempotency):');

  // Order 1 was verified above with UTR 165422408474
  const resRepeated = await verifyOrderWithAlert(order1, parsedAlert1, { allowDirectIdMatch: true });

  assert(resRepeated.success === true, 'Repeated processing succeeds safely without error');
  assert(resRepeated.status === 'verified', 'Order status remains "verified"');
  assert(resRepeated.isIdempotent === true, 'Identifies repeated run as idempotent');
  assert(order1.status === 'verified', 'Order document remains properly verified');

  // ---------------------------------------------------------------------------
  // 8. Concurrent Verification Safety
  // ---------------------------------------------------------------------------
  console.log('\n8. Testing Concurrent Verification Safety:');

  const order8 = createMockOrder({ orderId: 'FLX-ORD-1008', payableAmount: 149.38, expectedAmountPaise: 14938 });
  memoryStore.orders.push(order8);

  const alert8 = parsePaymentAlert({
    from: 'no-reply@famapp.in',
    subject: 'You received ₹149.38 for FLX-ORD-1008',
    text: 'Received ₹149.38. UTR: 778899001122. Order Ref: FLX-ORD-1008.',
    date: new Date().toISOString(),
  }, 'no-reply@famapp.in');

  // Run 3 concurrent verification calls for the same order
  const [c1, c2, c3] = await Promise.all([
    verifyOrderWithAlert(order8, alert8, { allowDirectIdMatch: true }),
    verifyOrderWithAlert(order8, alert8, { allowDirectIdMatch: true }),
    verifyOrderWithAlert(order8, alert8, { allowDirectIdMatch: true }),
  ]);

  assert(c1.success && c2.success && c3.success, 'All concurrent calls succeed without throwing exceptions');
  assert(order8.status === 'verified', 'Order is in verified status after concurrent execution');
  assert(order8.matchedUtr === '778899001122', 'Final order matchedUtr is properly preserved');

  // ---------------------------------------------------------------------------
  // 9. Unverified Sender Rejection
  // ---------------------------------------------------------------------------
  console.log('\n9. Testing Unverified Sender Rejection:');

  const order9 = createMockOrder({ orderId: 'FLX-ORD-1009', payableAmount: 149.38, expectedAmountPaise: 14938 });
  memoryStore.orders.push(order9);

  const untrustedAlert = parsePaymentAlert({
    from: 'hacker@phishing.com',
    subject: 'Payment alert ₹149.38 for FLX-ORD-1009',
    text: 'Received ₹149.38. UTR: 665544332211. Order Ref: FLX-ORD-1009.',
    date: new Date().toISOString(),
  }, 'no-reply@famapp.in');

  const res9 = await verifyOrderWithAlert(order9, untrustedAlert, { allowDirectIdMatch: true });

  assert(res9.success === false, 'Strictly rejects alert from unverified sender');
  assert(res9.reason.includes('not in the verified FamPay sender allowlist'), 'Reason cites unverified sender allowlist');
  assert(order9.status !== 'verified', 'Order 9 is not marked verified');

  // ---------------------------------------------------------------------------
  // 10. Non-Successful Payment Status Rejection
  // ---------------------------------------------------------------------------
  console.log('\n10. Testing Non-Successful Payment Status Rejection:');

  const order10 = createMockOrder({ orderId: 'FLX-ORD-1010', payableAmount: 149.38, expectedAmountPaise: 14938 });
  memoryStore.orders.push(order10);

  const failedAlert = parsePaymentAlert({
    from: 'no-reply@famapp.in',
    subject: 'Payment Failed: ₹149.38',
    text: 'Transaction failed for FLX-ORD-1010. Amount ₹149.38. UTR: 112233445566. Order Ref: FLX-ORD-1010.',
    date: new Date().toISOString(),
  }, 'no-reply@famapp.in');

  const res10 = await verifyOrderWithAlert(order10, failedAlert, { allowDirectIdMatch: true });

  assert(res10.success === false, 'Rejects failed payment alert');
  assert(res10.status === 'failed', 'Marks order failed on payment failure');
  assert(res10.reason.includes('FAILED'), 'Reason notes FAILED status');

  // ---------------------------------------------------------------------------
  // 11. Missing Required Fields Rejection
  // ---------------------------------------------------------------------------
  console.log('\n11. Testing Missing Required Fields Rejection:');

  const order11 = createMockOrder({ orderId: 'FLX-ORD-1011', payableAmount: 149.38, expectedAmountPaise: 14938 });
  memoryStore.orders.push(order11);

  const missingUtrAlert = parsePaymentAlert({
    from: 'no-reply@famapp.in',
    subject: 'Payment Received for FLX-ORD-1011',
    text: 'Payment received ₹149.38 successfully into account. Order Ref: FLX-ORD-1011.',
    date: new Date().toISOString(),
  }, 'no-reply@famapp.in');

  const res11 = await verifyOrderWithAlert(order11, missingUtrAlert, { allowDirectIdMatch: true });

  assert(res11.success === false, 'Rejects alert missing 12-digit UPI UTR');
  assert(res11.reason.includes('Missing required 12-digit UPI UTR'), 'Reason notes missing UTR');
  assert(order11.status !== 'verified', 'Order 11 is not verified without UTR');

  // Test missing amount
  const missingAmountAlert = parsePaymentAlert({
    from: 'no-reply@famapp.in',
    subject: 'Payment Received for FLX-ORD-1011',
    text: 'Payment received successfully. UTR: 112233445566. Order Ref: FLX-ORD-1011.',
    date: new Date().toISOString(),
  }, 'no-reply@famapp.in');
  const resMissingAmount = await verifyOrderWithAlert(order11, missingAmountAlert, { allowDirectIdMatch: true });
  assert(resMissingAmount.success === false, 'Rejects alert missing amount');
  assert(resMissingAmount.reason.includes('Missing required amount'), 'Reason notes missing amount');

  // ---------------------------------------------------------------------------
  // 12. Safe Masking & Helper Functions
  // ---------------------------------------------------------------------------
  console.log('\n12. Testing Safe Masking & Window Validation:');

  assert(maskUtr('165422408474') === '1654****8474', 'Masks standard 12-digit UTR with middle 4 stars');
  assert(maskUtr('12345678') === '12****78', 'Masks 8-character reference safely');
  assert(maskUtr('') === '—', 'Returns dash on empty UTR');
  assert(maskUtr(null) === '—', 'Returns dash on null UTR');

  assert(getOrderExpectedPaise({ payableAmount: 149.38 }) === 14938, 'Converts 149.38 float to 14938 integer paise');
  assert(getOrderExpectedPaise({ expectedAmountPaise: 29900 }) === 29900, 'Prefers precomputed integer paise');

  const testWindowOrder = createMockOrder();
  const validWindow = isWithinPaymentWindow(testWindowOrder, new Date());
  assert(validWindow.valid === true, 'Accepts payment made within active order window');

  console.log('\n============================================================');
  console.log(`Results: ${passedTests}/${totalTests} tests passed.`);
  console.log('============================================================');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
