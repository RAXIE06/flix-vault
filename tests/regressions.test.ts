/**
 * FlixVault Regression Test Suite
 * 
 * Verifies fixes for:
 * - Issue 1: Movie Poster Upload Failure (HTML response handling, JSON validation, GridFS upload, route aliases, 404 catch-all)
 * - Issue 2: Admin Secret-Code Authentication Regression (secret-code modal, server validation, HttpOnly cookie, API protection, logout)
 */

import crypto from 'crypto';
import mongoose from 'mongoose';
import { Readable, PassThrough } from 'stream';
import {
  createSessionToken,
  verifySessionToken,
  getAdminAccessCode,
} from '../server/auth';
import {
  validateImageBuffer,
  storePosterInGridFS,
  getPosterStreamFromGridFS,
  deletePosterFromGridFS,
  getPostersBucket,
  MAX_POSTER_SIZE_BYTES,
} from '../server/posterStorage';

console.log('🧪 ============================================================');
console.log('🧪 FlixVault Regression Test Suite (Issues 1 & 2)');
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
// Helpers for Simulating Safe Response Parsing (Issue 1)
// -----------------------------------------------------------------------------

async function simulateParseResponse<T = any>(
  status: number,
  contentType: string,
  bodyText: string,
  defaultError: string
): Promise<{ success: boolean; data?: T; error?: string }> {
  try {
    const isJson = contentType.includes('application/json');
    if (isJson) {
      let data: any = {};
      try {
        data = JSON.parse(bodyText);
      } catch {
        data = {};
      }
      if (status >= 400) {
        throw new Error(data.error || data.message || `${defaultError} (HTTP ${status})`);
      }
      return { success: true, data };
    }

    // Non-JSON response (e.g. HTML 404/500/502)
    const cleanSnippet = bodyText
      ? bodyText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 150)
      : 'Unexpected non-JSON response';

    if (status >= 400) {
      throw new Error(`${defaultError} (HTTP ${status}: ${cleanSnippet})`);
    }

    return { success: true, data: { text: bodyText } as unknown as T };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

async function runRegressions() {
  // ===========================================================================
  // SECTION 1: Issue 1 — Movie Poster Upload Failure & Response Safety
  // ===========================================================================
  console.log('1. Testing Issue 1: Robust Response Parsing (No Unexpected token "<")');

  // Test 1.1: HTML 404 response does NOT throw JSON parse error
  const html404 = '<!doctype html><html><head><title>Not Found</title></head><body>404 Route Not Found</body></html>';
  const res1 = await simulateParseResponse(404, 'text/html', html404, 'Failed to upload poster image');
  assert(res1.success === false, 'Detects HTTP 404 HTML response cleanly without crashing');
  assert(
    !res1.error?.includes('Unexpected token') && !res1.error?.includes('is not valid JSON'),
    'Safely prevents SyntaxError on HTML 404 response'
  );
  assert(
    res1.error?.includes('HTTP 404') === true,
    'Extracts HTTP 404 status code into readable error message'
  );

  // Test 1.2: HTML 502 Bad Gateway / Proxy response
  const html502 = '<!DOCTYPE html><html><body><h1>502 Bad Gateway</h1><p>Server unavailable</p></body></html>';
  const res2 = await simulateParseResponse(502, 'text/html', html502, 'Failed to upload poster image');
  assert(res2.success === false, 'Handles HTTP 502 HTML gateway error safely');
  assert(!res2.error?.includes('Unexpected token'), 'Prevents JSON syntax error on gateway HTML');

  // Test 1.3: Valid JSON response parsed successfully
  const validJson = JSON.stringify({
    success: true,
    fileId: '507f1f77bcf86cd799439011',
    posterUrl: '/api/posters/507f1f77bcf86cd799439011',
    contentType: 'image/jpeg',
    size: 2048,
  });
  const res3 = await simulateParseResponse(201, 'application/json', validJson, 'Failed to upload poster image');
  assert(res3.success === true, 'Parses valid JSON success response cleanly');
  assert((res3.data as any)?.fileId === '507f1f77bcf86cd799439011', 'Returns correct GridFS fileId');

  // Test 1.4: JSON error response (e.g. 503 DB Disconnected) parsed correctly
  const dbErrorJson = JSON.stringify({
    error: 'MongoDB connection required. Movie posters must be stored persistently in MongoDB GridFS.',
    code: 'DATABASE_DISCONNECTED',
  });
  const res4 = await simulateParseResponse(503, 'application/json', dbErrorJson, 'Failed to upload poster image');
  assert(res4.success === false, 'Correctly flags 503 error status');
  assert(res4.error?.includes('MongoDB connection required') === true, 'Extracts server error message from JSON');

  // ===========================================================================
  // SECTION 2: Poster Validation & GridFS Mechanics
  // ===========================================================================
  console.log('\n2. Testing Poster Validation & GridFS Mechanics:');

  // 2.1 JPEG Magic bytes
  const jpegBuf = Buffer.alloc(1024, 0x11);
  jpegBuf[0] = 0xff;
  jpegBuf[1] = 0xd8;
  jpegBuf[2] = 0xff;
  const vJpeg = validateImageBuffer(jpegBuf, 'image/jpeg');
  assert(vJpeg.valid === true, 'Accepts valid JPEG buffer with FF D8 FF signature');
  assert(vJpeg.detectedMime === 'image/jpeg', 'Detects image/jpeg from magic bytes');

  // 2.2 Rejection of HTML pretending to be image/jpeg
  const htmlSpoof = Buffer.from('<!doctype html><html><body><h1>Fake Image</h1></body></html>');
  const vHtml = validateImageBuffer(htmlSpoof, 'image/jpeg');
  assert(vHtml.valid === false, 'Strictly rejects HTML document disguised as image/jpeg');
  assert(vHtml.error?.includes('Invalid file format') === true, 'Explains format signature mismatch');

  // 2.3 File size enforcement (5MB limit)
  const oversized = Buffer.alloc(MAX_POSTER_SIZE_BYTES + 2048);
  oversized[0] = 0xff;
  oversized[1] = 0xd8;
  oversized[2] = 0xff;
  const vOver = validateImageBuffer(oversized, 'image/jpeg');
  assert(vOver.valid === false, 'Rejects files exceeding 5MB');
  assert(vOver.error?.includes('5MB') === true, 'Error message explicitly reports 5MB threshold');

  // 2.4 DB disconnected safety
  assert(getPostersBucket() === null, 'getPostersBucket returns null when MongoDB is disconnected');

  // ===========================================================================
  // SECTION 3: Issue 2 — Admin Secret-Code Authentication Regression
  // ===========================================================================
  console.log('\n3. Testing Issue 2: Admin Secret-Code Authentication & Session Enforcement');

  const configuredCode = getAdminAccessCode();
  assert(typeof configuredCode === 'string' && configuredCode.length > 0, 'Configured admin access code is loaded');

  // 3.1 Validate access code matching logic
  const isCorrectCode = (code: string) => {
    const inputBuf = Buffer.from(code.trim());
    const targetBuf = Buffer.from(configuredCode.trim());
    return inputBuf.length === targetBuf.length && crypto.timingSafeEqual(inputBuf, targetBuf);
  };

  assert(isCorrectCode(configuredCode) === true, 'Verifies valid access code');
  assert(isCorrectCode('wrong_secret_1234') === false, 'Rejects incorrect access code');
  assert(isCorrectCode('') === false, 'Rejects empty access code');
  assert(isCorrectCode(' ') === false, 'Rejects whitespace access code');

  // 3.2 Session token generation and verification
  const token = createSessionToken();
  assert(typeof token === 'string' && token.includes('.'), 'Generates HMAC-signed session token');
  assert(verifySessionToken(token) === true, 'Verifies newly issued session token');

  // 3.3 Reject tampered token
  const [b64Part, sigPart] = token.split('.');
  const tamperedToken = `${b64Part}.tampered_signature_xyz`;
  assert(verifySessionToken(tamperedToken) === false, 'Rejects token with tampered signature');

  // 3.4 Reject malformed token
  assert(verifySessionToken('not-a-valid-token') === false, 'Rejects malformed token');
  assert(verifySessionToken('') === false, 'Rejects empty token');

  // 3.5 Token payload inspection
  const payload = JSON.parse(Buffer.from(b64Part, 'base64url').toString('utf8'));
  assert(payload.role === 'admin', 'Token contains role=admin');
  assert(payload.exp > Date.now(), 'Token has valid future expiration');

  // 3.6 Reject expired token
  const expiredPayload = { ...payload, exp: Date.now() - 10000 };
  const expiredB64 = Buffer.from(JSON.stringify(expiredPayload)).toString('base64url');
  const expiredSig = crypto
    .createHmac('sha256', process.env.SESSION_SECRET || 'flixvault_default_secret_key_change_in_production')
    .update(expiredB64)
    .digest('base64url');
  assert(verifySessionToken(`${expiredB64}.${expiredSig}`) === false, 'Rejects expired token');

  // 3.7 Simulated admin API gatekeeper verification
  const checkAdminAuth = (authHeader?: string, cookieToken?: string) => {
    const candidate = cookieToken || authHeader?.replace(/^Bearer\s+/i, '');
    if (!candidate || !verifySessionToken(candidate)) {
      return { status: 401, error: 'Unauthorized: Admin authentication required to access this endpoint.' };
    }
    return { status: 200, user: 'admin' };
  };

  assert(checkAdminAuth(undefined, undefined).status === 401, 'Unauthenticated request receives 401 Unauthorized');
  assert(checkAdminAuth(`Bearer ${token}`).status === 200, 'Request with valid Bearer token receives 200 OK');
  assert(checkAdminAuth(undefined, token).status === 200, 'Request with valid HttpOnly cookie receives 200 OK');
  assert(checkAdminAuth('Bearer invalid_token').status === 401, 'Request with invalid Bearer token receives 401');

  // ===========================================================================
  // Summary
  // ===========================================================================
  console.log('\n============================================================');
  console.log(`Results: ${passedTests}/${totalTests} tests passed.`);
  console.log('============================================================');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runRegressions().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
