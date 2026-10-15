import React, { useState, useEffect } from 'react';
import {
  Mail,
  ShieldCheck,
  ShieldAlert,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  Zap,
  Lock,
  ArrowRight,
  Info,
  Clock,
  Layers,
  Inbox,
} from 'lucide-react';
import {
  GmailConfigStatus,
  GmailConnectionTestResult,
  FamPayDiagnosticResult,
  DiagnosticEmailSummary,
} from '../../types';
import { api } from '../../services/api';

const SYNTHETIC_FIXTURES = [
  {
    name: 'Real FamApp Alert (₹99.98)',
    from: 'FamApp <no-reply@famapp.in>',
    subject: 'You received ₹99.98 in your FamX account',
    text: `Hey Manish Kumar, You have successfully received ₹99.98 from NITISH KUMAR at 04:55 PM IST, 13 October 2026 with transaction id FMPIB6783525504. Your updated balance is ₹99.98. UTR: 165422408474. If this was not done by you, report this transaction at fraud-reporting@famapp.in`,
  },
  {
    name: 'FamPay Success Alert (₹149.38)',
    from: 'alerts@fampay.in',
    subject: 'Payment Received: ₹149.38 credited to your FamPay account',
    text: `Hi FlixVault Cinema,\n\nYou have received a payment of ₹149.38 from customer@okhdfcbank.\n\nTransaction Details:\nAmount: ₹149.38\nStatus: SUCCESS\nUPI Reference / UTR: 428691827364\nFamPay Txn ID: FAM-994821\nDate: ${new Date().toISOString()}\n\nThank you for choosing FamPay!`,
  },
  {
    name: 'FamPay Failed Payment',
    from: 'alerts@fampay.in',
    subject: 'Transaction Failed: Payment of ₹149.38 could not be completed',
    text: `Hi FlixVault Cinema,\n\nA payment attempt of ₹149.38 from customer@okaxis has failed due to bank timeout.\nStatus: FAILED / DECLINED\nUTR: 428691827365\nNo money was credited to your account.`,
  },
  {
    name: 'Unverified Third-Party Sender (Spam/Phishing)',
    from: 'unverified-service@randomdomain.com',
    subject: 'You received ₹149.38 from FamPay notification',
    text: `Payment credited ₹149.38. UTR: 428691827364. Click here to confirm.`,
  },
  {
    name: 'Incomplete Alert (Missing UTR)',
    from: 'alerts@fampay.in',
    subject: 'Payment update: ₹149.38 received',
    text: `Payment of ₹149.38 was successfully received into your balance. Reference details will follow shortly.`,
  },
];

export const GmailVerificationSection: React.FC = () => {
  const [status, setStatus] = useState<GmailConfigStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<GmailConnectionTestResult | null>(null);

  // Diagnostic Parser Playground State
  const [sampleSender, setSampleSender] = useState(SYNTHETIC_FIXTURES[0].from);
  const [sampleSubject, setSampleSubject] = useState(SYNTHETIC_FIXTURES[0].subject);
  const [sampleBody, setSampleBody] = useState(SYNTHETIC_FIXTURES[0].text);
  const [diagnosing, setDiagnosing] = useState(false);
  const [parseResult, setParseResult] = useState<FamPayDiagnosticResult | null>(null);

  // Recent Mailbox Diagnostic State
  const [loadingRecent, setLoadingRecent] = useState(false);
  const [recentEmails, setRecentEmails] = useState<DiagnosticEmailSummary[]>([]);
  const [recentError, setRecentError] = useState<string | null>(null);
  const [runningVerification, setRunningVerification] = useState(false);
  const [verificationFeedback, setVerificationFeedback] = useState<any>(null);

  const handleRunVerification = async () => {
    setRunningVerification(true);
    setVerificationFeedback(null);
    try {
      const res = await api.verifyPayments(25);
      setVerificationFeedback(res);
      handleFetchRecentAlerts();
    } catch (err: any) {
      setVerificationFeedback({ error: err.message || 'Verification failed' });
    } finally {
      setRunningVerification(false);
    }
  };

  useEffect(() => {
    loadGmailStatus();
  }, []);

  const loadGmailStatus = async () => {
    setLoadingStatus(true);
    try {
      const res = await api.getGmailStatus();
      setStatus(res);
    } catch (err) {
      console.error('Failed to load Gmail IMAP status:', err);
    } finally {
      setLoadingStatus(false);
    }
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setTestResult(null);
    try {
      const res = await api.testGmailConnection();
      setTestResult(res);
    } catch (err: any) {
      setTestResult({
        success: false,
        message: 'Could not communicate with the verification server.',
        durationMs: 0,
        ordersMarkedPaid: 0,
        error: err.message || 'Network request failed',
      });
    } finally {
      setTestingConnection(false);
    }
  };

  const handleRunDiagnostic = async () => {
    setDiagnosing(true);
    try {
      const res = await api.diagnoseGmailParser({
        from: sampleSender,
        subject: sampleSubject,
        text: sampleBody,
      });
      setParseResult(res.result);
    } catch (err: any) {
      console.error('Diagnostic error:', err);
    } finally {
      setDiagnosing(false);
    }
  };

  const handleSelectFixture = (fixture: typeof SYNTHETIC_FIXTURES[0]) => {
    setSampleSender(fixture.from);
    setSampleSubject(fixture.subject);
    setSampleBody(fixture.text);
    setParseResult(null);
  };

  const handleFetchRecentAlerts = async () => {
    setLoadingRecent(true);
    setRecentError(null);
    try {
      const res = await api.getRecentEmailAlerts(10);
      if (res.success) {
        setRecentEmails(res.emails);
      } else {
        setRecentError(res.error || 'Failed to inspect mailbox.');
      }
    } catch (err: any) {
      setRecentError(err.message || 'Failed to inspect mailbox.');
    } finally {
      setLoadingRecent(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-red-950/40 via-zinc-900 to-zinc-900 border border-red-800/30 rounded-xl p-5 shadow-lg">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-red-600/20 border border-red-500/30 rounded-lg text-red-400 mt-1">
              <Mail className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-white tracking-wide">Gmail IMAP Payment Verification</h3>
                <span className="px-2 py-0.5 text-xs font-semibold rounded bg-red-500/20 border border-red-500/40 text-red-300">
                  Phase 3A Active
                </span>
              </div>
              <p className="text-sm text-zinc-300 mt-1 max-w-2xl">
                Monitors incoming FamPay UPI payment alerts using secure, encrypted IMAP over SSL/TLS. Automatic order status confirmation is paused until genuine email formats are validated.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start md:self-center">
            <button
              onClick={loadGmailStatus}
              disabled={loadingStatus}
              className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium rounded-lg border border-zinc-700 flex items-center gap-1.5 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingStatus ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Grid: IMAP Configuration Status & Connection Tester */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: IMAP Configuration Info */}
        <div className="lg:col-span-1 bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <h4 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider flex items-center gap-2">
              <Lock className="w-4 h-4 text-amber-400" />
              IMAP Configuration
            </h4>
            {status?.configured ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-800/60">
                <CheckCircle2 className="w-3 h-3" />
                Configured
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-amber-950/80 text-amber-400 border border-amber-800/60">
                <AlertTriangle className="w-3 h-3" />
                Pending Env
              </span>
            )}
          </div>

          <div className="space-y-3 text-xs">
            <div className="flex justify-between items-center py-1.5 border-b border-zinc-800/60">
              <span className="text-zinc-400">Host Server</span>
              <span className="font-mono text-zinc-200">{status?.host || 'imap.gmail.com'}</span>
            </div>
            <div className="flex justify-between items-center py-1.5 border-b border-zinc-800/60">
              <span className="text-zinc-400">Port & Security</span>
              <span className="font-mono text-zinc-200">{status?.port || 993} (SSL/TLS)</span>
            </div>
            <div className="flex justify-between items-center py-1.5 border-b border-zinc-800/60">
              <span className="text-zinc-400">Account (Masked)</span>
              <span className="font-mono text-zinc-200 font-semibold">{status?.userMasked || 'None'}</span>
            </div>
            <div className="flex flex-col gap-1 py-1.5 border-b border-zinc-800/60">
              <span className="text-zinc-400">Verified Sender Filter</span>
              <span className="font-mono text-zinc-300 break-all bg-zinc-950 p-1.5 rounded border border-zinc-800">
                {status?.verifiedSender || 'alerts@fampay.in'}
              </span>
            </div>
            <div className="flex justify-between items-center py-1.5 border-b border-zinc-800/60">
              <span className="text-zinc-400">Auto-Payment Marking</span>
              <span className="font-semibold text-amber-400">Disabled (Phase 3A)</span>
            </div>
          </div>

          {/* Setup Instructions Box */}
          <div className="p-3 bg-zinc-950/70 border border-zinc-800/80 rounded-lg text-xs space-y-1.5 text-zinc-400">
            <p className="font-semibold text-zinc-300 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-cyan-400" />
              Environment Variables Required:
            </p>
            <ul className="list-disc list-inside space-y-1 font-mono text-[11px] text-zinc-400">
              <li>GMAIL_USER=alerts.flixvault@gmail.com</li>
              <li>GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx</li>
              <li>GMAIL_IMAP_HOST=imap.gmail.com</li>
              <li>GMAIL_IMAP_PORT=993</li>
            </ul>
            <p className="text-[11px] text-zinc-500 pt-1">
              Google App Passwords can be created at Google Account &gt; Security &gt; 2-Step Verification &gt; App passwords.
            </p>
          </div>

          {/* Test Connection Button */}
          <button
            onClick={handleTestConnection}
            disabled={testingConnection}
            className="w-full py-2.5 px-4 bg-red-600 hover:bg-red-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-medium text-xs rounded-lg shadow-md transition-all flex items-center justify-center gap-2"
          >
            {testingConnection ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Connecting to Gmail IMAP (SSL)...
              </>
            ) : (
              <>
                <Zap className="w-3.5 h-3.5" />
                Test Gmail IMAP Connection
              </>
            )}
          </button>
        </div>

        {/* Right Columns: Live Test Result & Diagnostic Parser Playground */}
        <div className="lg:col-span-2 space-y-6">
          {/* Connection Test Output */}
          {testResult && (
            <div
              className={`p-4 rounded-xl border transition-all ${
                testResult.success
                  ? 'bg-emerald-950/30 border-emerald-600/40 text-emerald-200'
                  : 'bg-red-950/30 border-red-600/40 text-red-200'
              }`}
            >
              <div className="flex items-start gap-3">
                {testResult.success ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                )}
                <div className="space-y-1 flex-1">
                  <div className="flex items-center justify-between">
                    <h5 className="font-semibold text-sm">
                      {testResult.success ? 'IMAP Connection Succeeded' : 'IMAP Connection Test Failed'}
                    </h5>
                    <span className="text-xs px-2 py-0.5 rounded bg-zinc-900/60 border border-zinc-700 font-mono text-zinc-300">
                      {testResult.durationMs}ms
                    </span>
                  </div>
                  <p className="text-xs text-zinc-300">{testResult.message}</p>

                  {testResult.error && (
                    <div className="mt-2 p-2.5 bg-black/40 rounded border border-red-900/40 font-mono text-xs text-red-300">
                      Error: {testResult.error}
                    </div>
                  )}

                  {testResult.mailbox && (
                    <div className="mt-2 grid grid-cols-3 gap-2 pt-2 border-t border-emerald-900/40 text-xs">
                      <div className="bg-emerald-950/40 p-2 rounded border border-emerald-800/40">
                        <span className="text-emerald-400/80 block text-[10px]">Total Messages</span>
                        <span className="font-mono text-base font-bold text-emerald-200">
                          {testResult.mailbox.messagesTotal}
                        </span>
                      </div>
                      <div className="bg-emerald-950/40 p-2 rounded border border-emerald-800/40">
                        <span className="text-emerald-400/80 block text-[10px]">Unread Alerts</span>
                        <span className="font-mono text-base font-bold text-emerald-200">
                          {testResult.mailbox.unseen}
                        </span>
                      </div>
                      <div className="bg-emerald-950/40 p-2 rounded border border-emerald-800/40">
                        <span className="text-emerald-400/80 block text-[10px]">Next UID</span>
                        <span className="font-mono text-base font-bold text-emerald-200">
                          {testResult.mailbox.uidNext}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Exact Sender Check & Real FamApp Inspection */}
                  {testResult.senderCheck && (
                    <div className="mt-3 pt-3 border-t border-emerald-900/40 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-emerald-300 flex items-center gap-1.5">
                          <ShieldCheck className="w-4 h-4 text-emerald-400" />
                          Verified Sender Check ({testResult.senderCheck.exactSenderConfigured}):
                        </span>
                        <span className="font-mono text-emerald-300 font-bold px-2 py-0.5 rounded bg-emerald-950 border border-emerald-800">
                          {testResult.senderCheck.matchingEmailsCount} Emails Found
                        </span>
                      </div>

                      {testResult.senderCheck.latestAlertInspection ? (
                        <div className="bg-zinc-950/80 p-3 rounded-lg border border-emerald-900/40 space-y-2.5">
                          <div className="flex items-center justify-between text-[11px] text-zinc-400 pb-1.5 border-b border-zinc-800">
                            <span>Latest Alert Format Inspection (No email body exposed):</span>
                            <span className="font-semibold text-emerald-400 uppercase">
                              Status: {testResult.senderCheck.latestAlertInspection.paymentStatus}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                            <div className="bg-zinc-900/80 p-2 rounded border border-zinc-800">
                              <span className="text-zinc-500 block text-[10px]">Transaction Amount</span>
                              <span className="font-mono font-bold text-emerald-300">
                                {testResult.senderCheck.latestAlertInspection.transactionAmount
                                  ? `₹${testResult.senderCheck.latestAlertInspection.transactionAmount.amountInRupees.toFixed(2)} (${testResult.senderCheck.latestAlertInspection.transactionAmount.amountInPaise}p)`
                                  : 'Not detected'}
                              </span>
                            </div>

                            <div className="bg-zinc-900/80 p-2 rounded border border-zinc-800">
                              <span className="text-zinc-500 block text-[10px]">Transaction ID</span>
                              <span className="font-mono text-zinc-200">
                                {testResult.senderCheck.latestAlertInspection.transactionId || 'None'}
                              </span>
                            </div>

                            <div className="bg-zinc-900/80 p-2 rounded border border-zinc-800">
                              <span className="text-zinc-500 block text-[10px]">UPI Reference (UTR)</span>
                              <span className="font-mono text-zinc-200">
                                {testResult.senderCheck.latestAlertInspection.utr || 'None'}
                              </span>
                            </div>

                            <div className="bg-zinc-900/80 p-2 rounded border border-zinc-800">
                              <span className="text-zinc-500 block text-[10px]">Timestamp</span>
                              <span className="font-mono text-[11px] text-zinc-300">
                                {testResult.senderCheck.latestAlertInspection.timestamp
                                  ? new Date(testResult.senderCheck.latestAlertInspection.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })
                                  : 'None'}
                              </span>
                            </div>
                          </div>

                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px] text-zinc-400 pt-1">
                            <div>
                              <span className="text-zinc-500">Subject: </span>
                              <span className="font-mono text-zinc-300">{testResult.senderCheck.latestAlertInspection.subject}</span>
                            </div>
                            <div className="font-semibold text-amber-400">
                              Orders Paid: {testResult.ordersMarkedPaid} (Inspection Only)
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="p-2 bg-amber-950/40 rounded border border-amber-900/40 text-[11px] text-amber-300">
                          No matching payment alert emails found from {testResult.senderCheck.exactSenderConfigured}.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* FamPay Email Alert Diagnostic Parser Sandbox */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800 pb-3">
              <div>
                <h4 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-red-400" />
                  FamPay Alert Diagnostic Parser Sandbox
                </h4>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Verify how incoming emails are parsed and validated against strict Phase 3 security requirements.
                </p>
              </div>

              {/* Synthetic Fixtures Dropdown/Pills */}
              <div className="flex flex-wrap gap-1.5">
                {SYNTHETIC_FIXTURES.map((fixture, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSelectFixture(fixture)}
                    className="px-2 py-1 text-[11px] bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded border border-zinc-700 transition-colors"
                  >
                    Sample {idx + 1}
                  </button>
                ))}
              </div>
            </div>

            {/* Playground Form */}
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Sender Address (From)</label>
                  <input
                    type="text"
                    value={sampleSender}
                    onChange={(e) => setSampleSender(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 font-mono focus:outline-none focus:border-red-500"
                    placeholder="alerts@fampay.in"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Email Subject</label>
                  <input
                    type="text"
                    value={sampleSubject}
                    onChange={(e) => setSampleSubject(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 font-mono focus:outline-none focus:border-red-500"
                    placeholder="Payment Received: ₹149.38 credited..."
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">
                  Email Body Content (Synthetic or Redacted Sample)
                </label>
                <textarea
                  rows={4}
                  value={sampleBody}
                  onChange={(e) => setSampleBody(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-xs text-zinc-200 font-mono focus:outline-none focus:border-red-500 leading-relaxed"
                  placeholder="Paste email alert body..."
                />
              </div>

              <div className="flex justify-end">
                <button
                  onClick={handleRunDiagnostic}
                  disabled={diagnosing}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium rounded-lg border border-zinc-700 flex items-center gap-1.5 transition-colors"
                >
                  {diagnosing ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <ShieldCheck className="w-3.5 h-3.5 text-red-400" />
                  )}
                  Run Diagnostic Parse
                </button>
              </div>
            </div>

            {/* Diagnostic Parse Results Display */}
            {parseResult && (
              <div className="mt-4 p-4 bg-zinc-950 rounded-xl border border-zinc-800 space-y-3">
                <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                    Parser Diagnostic Report
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-400">Confidence:</span>
                    <span
                      className={`text-xs font-bold px-2 py-0.5 rounded ${
                        parseResult.parseConfidence === 'HIGH'
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                          : parseResult.parseConfidence === 'MEDIUM'
                          ? 'bg-amber-950 text-amber-400 border border-amber-800'
                          : 'bg-red-950 text-red-400 border border-red-800'
                      }`}
                    >
                      {parseResult.parseConfidence}
                    </span>
                  </div>
                </div>

                {/* Parsed Fields Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  <div className="p-2 bg-zinc-900 rounded border border-zinc-800">
                    <span className="text-zinc-500 block text-[10px]">Verified Sender</span>
                    <span
                      className={`font-semibold flex items-center gap-1 ${
                        parseResult.isVerifiedSender ? 'text-emerald-400' : 'text-red-400'
                      }`}
                    >
                      {parseResult.isVerifiedSender ? (
                        <>
                          <CheckCircle2 className="w-3 h-3" /> Yes
                        </>
                      ) : (
                        <>
                          <XCircle className="w-3 h-3" /> Unverified
                        </>
                      )}
                    </span>
                  </div>

                  <div className="p-2 bg-zinc-900 rounded border border-zinc-800">
                    <span className="text-zinc-500 block text-[10px]">Detected Status</span>
                    <span
                      className={`font-semibold ${
                        parseResult.detectedStatus === 'SUCCESS'
                          ? 'text-emerald-400'
                          : parseResult.detectedStatus === 'FAILED'
                          ? 'text-red-400'
                          : 'text-amber-400'
                      }`}
                    >
                      {parseResult.detectedStatus}
                    </span>
                  </div>

                  <div className="p-2 bg-zinc-900 rounded border border-zinc-800">
                    <span className="text-zinc-500 block text-[10px]">Parsed Amount</span>
                    <span className="font-mono font-semibold text-zinc-200">
                      {parseResult.detectedAmount ? (
                        <>
                          ₹{parseResult.detectedAmount.amountInRupees.toFixed(2)}{' '}
                          <span className="text-zinc-500 text-[10px]">
                            ({parseResult.detectedAmount.amountInPaise}p)
                          </span>
                        </>
                      ) : (
                        <span className="text-zinc-500">Not detected</span>
                      )}
                    </span>
                  </div>

                  <div className="p-2 bg-zinc-900 rounded border border-zinc-800">
                    <span className="text-zinc-500 block text-[10px]">UPI Reference (UTR)</span>
                    <span className="font-mono font-semibold text-zinc-200">
                      {parseResult.detectedUtr || <span className="text-zinc-500">None</span>}
                    </span>
                  </div>
                </div>

                {/* Limitations and Missing Fields Warning */}
                {parseResult.limitations.length > 0 && (
                  <div className="p-3 bg-amber-950/30 border border-amber-900/50 rounded-lg text-xs space-y-1">
                    <span className="font-semibold text-amber-300 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Parser Limitations & Safety Constraints:
                    </span>
                    <ul className="list-disc list-inside text-zinc-300 space-y-0.5 text-[11px]">
                      {parseResult.limitations.map((lim, i) => (
                        <li key={i}>{lim}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Inspect Recent Mailbox Alerts (Diagnostic Only) */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <h4 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                  <Inbox className="w-4 h-4 text-cyan-400" />
                  Mailbox Recent Alert Diagnostics
                </h4>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Inspects message envelopes and runs the diagnostic parser without exposing sensitive email bodies.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleRunVerification}
                  disabled={runningVerification || !status?.configured}
                  className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:bg-purple-950 disabled:text-zinc-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Zap className={`w-3.5 h-3.5 ${runningVerification ? 'animate-spin' : ''}`} />
                  {runningVerification ? 'Verifying...' : 'Verify Payments Now'}
                </button>

                <button
                  onClick={handleFetchRecentAlerts}
                  disabled={loadingRecent || !status?.configured}
                  className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:bg-zinc-850 disabled:text-zinc-600 text-zinc-200 text-xs font-medium rounded-lg border border-zinc-700 flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingRecent ? 'animate-spin' : ''}`} />
                  Check Mailbox
                </button>
              </div>
            </div>

            {verificationFeedback && (
              <div className="p-3 bg-purple-950/40 border border-purple-800/40 rounded-lg text-xs space-y-1">
                <div className="font-semibold text-purple-300 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  Verification Results:
                </div>
                {verificationFeedback.error ? (
                  <div className="text-red-300">{verificationFeedback.error}</div>
                ) : (
                  <div className="text-zinc-300 space-x-2">
                    <span className="text-emerald-400 font-semibold">{verificationFeedback.ordersVerifiedCount || 0} Verified</span>
                    <span>·</span>
                    <span className="text-amber-400 font-semibold">{verificationFeedback.ordersNeedsReviewCount || 0} Needs Review</span>
                    <span>·</span>
                    <span className="text-zinc-400">{verificationFeedback.scannedEmailsCount || 0} Emails Inspected</span>
                  </div>
                )}
              </div>
            )}

            {recentError && (
              <div className="p-3 bg-red-950/40 border border-red-800/40 rounded-lg text-xs text-red-300">
                {recentError}
              </div>
            )}

            {recentEmails.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-800 text-zinc-400">
                      <th className="py-2 px-2.5">Date</th>
                      <th className="py-2 px-2.5">Sender</th>
                      <th className="py-2 px-2.5">Subject</th>
                      <th className="py-2 px-2.5">Status</th>
                      <th className="py-2 px-2.5">Amount</th>
                      <th className="py-2 px-2.5">UTR</th>
                      <th className="py-2 px-2.5">Confidence</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-850">
                    {recentEmails.map((email) => (
                      <tr key={email.uid} className="hover:bg-zinc-850/50">
                        <td className="py-2 px-2.5 text-zinc-400 whitespace-nowrap">
                          {email.date ? new Date(email.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                        </td>
                        <td className="py-2 px-2.5 font-mono text-zinc-300">
                          {email.from}
                        </td>
                        <td className="py-2 px-2.5 text-zinc-200 max-w-xs truncate">
                          {email.subject}
                        </td>
                        <td className="py-2 px-2.5">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                              email.detectedStatus === 'SUCCESS'
                                ? 'bg-emerald-950 text-emerald-400'
                                : 'bg-zinc-800 text-zinc-400'
                            }`}
                          >
                            {email.detectedStatus}
                          </span>
                        </td>
                        <td className="py-2 px-2.5 font-mono text-zinc-200">
                          {email.detectedAmount ? `₹${email.detectedAmount.amountInRupees}` : '—'}
                        </td>
                        <td className="py-2 px-2.5 font-mono text-zinc-400">
                          {email.detectedUtr || '—'}
                        </td>
                        <td className="py-2 px-2.5">
                          <span className="text-[10px] font-medium text-zinc-400">
                            {email.parseConfidence}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-6 text-center text-xs text-zinc-500">
                {!status?.configured
                  ? 'Configure GMAIL_USER and GMAIL_APP_PASSWORD in environment variables to check live mailbox.'
                  : 'Click "Check Mailbox" to inspect recent message headers.'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
