import React, { useState, useEffect } from 'react';
import {
  X,
  QrCode,
  Copy,
  Check,
  ShieldAlert,
  Loader2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Code2,
  AlertCircle,
  Send,
  Clock,
  Smartphone,
} from 'lucide-react';
import QRCode from 'qrcode';
import { Movie, UpiPaymentOrder, UserOrderRecord } from '../types';
import { api } from '../services/api';

interface PurchaseModalProps {
  movie: Movie | null;
  onClose: () => void;
}

const VERIFY_MAX_SECONDS = 120;
const RECOVERY_STORAGE_KEY = 'flixvault_my_orders';

/**
 * Save/Update order in localStorage for recovery after browser refresh.
 */
function saveOrderToLocalStorage(order: UpiPaymentOrder) {
  try {
    const raw = localStorage.getItem(RECOVERY_STORAGE_KEY);
    const existing: UserOrderRecord[] = raw ? JSON.parse(raw) : [];

    const record: UserOrderRecord = {
      orderId: order.orderId,
      movieId: order.movieId,
      movieTitle: order.movieTitle,
      payableAmount: order.payableAmount,
      status: order.status,
      telegramInviteLink: order.telegramInviteLink,
      verifiedAt: order.verifiedAt,
      createdAt: order.createdAt,
      savedAt: Date.now(),
    };

    const filtered = existing.filter((o) => o.orderId !== order.orderId);
    const updated = [record, ...filtered].slice(0, 20); // keep last 20

    localStorage.setItem(RECOVERY_STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.warn('[localStorage] Failed to save order:', e);
  }
}

export const PurchaseModal: React.FC<PurchaseModalProps> = ({ movie, onClose }) => {
  const [order, setOrder] = useState<UpiPaymentOrder | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedVpa, setCopiedVpa] = useState(false);
  const [copiedAmount, setCopiedAmount] = useState(false);
  const [copiedUri, setCopiedUri] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [secondsElapsed, setSecondsElapsed] = useState(0);
  const [upiPhoneHint, setUpiPhoneHint] = useState<string | null>(null);

  // Initial order creation
  useEffect(() => {
    let isMounted = true;

    async function initOrder() {
      if (!movie) {
        setOrder(null);
        setQrDataUrl(null);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const res = await api.createUpiOrder(movie.id);

        if (!isMounted) return;
        setOrder(res.order);
        saveOrderToLocalStorage(res.order);

        const qrUrl = await QRCode.toDataURL(res.order.upiPaymentUri, {
          width: 320,
          margin: 4,
          color: { dark: '#000000', light: '#ffffff' },
          errorCorrectionLevel: 'M',
        });

        if (isMounted) {
          setQrDataUrl(qrUrl);
          setLoading(false);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || 'Failed to generate UPI payment order.');
          setLoading(false);
        }
      }
    }

    initOrder();

    return () => {
      isMounted = false;
    };
  }, [movie]);

  // Auto-poll order status every 8 seconds
  useEffect(() => {
    if (!order || order.status === 'verified' || order.status === 'expired') return;

    const orderId = order.orderId;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}`);
        if (!res.ok) return;
        const updated = await res.json();

        if (updated.status !== order.status) {
          setOrder(updated);
          saveOrderToLocalStorage(updated);
        }
      } catch (err) {
        // Silent fail
      }
    }, 8000);

    return () => clearInterval(interval);
  }, [order]);

  // Live verification timer
  useEffect(() => {
    if (!order || order.status !== 'pending') return;

    const startTime = new Date(order.createdAt || Date.now()).getTime();

    const tick = () => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      setSecondsElapsed(Math.max(0, elapsed));
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [order]);

  // ESC handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (movie) window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [movie, onClose]);

  if (!movie) return null;

  const handleCopyVpa = () => {
    if (order?.upiVpa) {
      navigator.clipboard.writeText(order.upiVpa);
      setCopiedVpa(true);
      setTimeout(() => setCopiedVpa(false), 2000);
    }
  };

  const handleCopyAmount = () => {
    if (order?.payableAmount) {
      navigator.clipboard.writeText(order.payableAmount.toFixed(2));
      setCopiedAmount(true);
      setTimeout(() => setCopiedAmount(false), 2000);
    }
  };

  const handleCopyUri = () => {
    if (order?.upiPaymentUri) {
      navigator.clipboard.writeText(order.upiPaymentUri);
      setCopiedUri(true);
      setTimeout(() => setCopiedUri(false), 2000);
    }
  };

  // ============================================================
  // UPI DEEP LINK HANDLER (Batch 3 fix)
  // ============================================================
  const handleOpenUpiApp = () => {
    if (!order) return;

    const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

    if (!isMobile) {
      setUpiPhoneHint(
        'Please scan the QR code above with your phone. UPI app deep links work only on mobile.'
      );
      setTimeout(() => setUpiPhoneHint(null), 5000);
      return;
    }

    // Build a clean, standards-compliant UPI URI
    // Only replace space (not @) in payee name — critical for GPay/PhonePe compatibility
    const cleanPayeeName = (order.upiPayeeName || 'FlixVault').replace(/\s+/g, '_');
    const cleanVpa = order.upiVpa;
    const cleanAmount = order.payableAmount.toFixed(2);
    const cleanOrderId = order.orderId.replace(/[^A-Za-z0-9-]/g, '');

    const uri = `upi://pay?pa=${encodeURIComponent(cleanVpa)}&pn=${encodeURIComponent(
      cleanPayeeName
    )}&am=${cleanAmount}&cu=INR&tn=${encodeURIComponent(cleanOrderId)}`;

    // Try multiple fallback strategies
    try {
      // Primary: direct navigation (works best on Android Chrome/Safari)
      window.location.href = uri;

      // Fallback: if app doesn't open in 2.5s, show hint
      setTimeout(() => {
        setUpiPhoneHint(
          'If your UPI app did not open, please scan the QR code above — that always works.'
        );
        setTimeout(() => setUpiPhoneHint(null), 6000);
      }, 2500);
    } catch (err) {
      setUpiPhoneHint('Could not open UPI app. Please use the QR code.');
      setTimeout(() => setUpiPhoneHint(null), 6000);
    }
  };

  // Timer-derived values
  const remaining = Math.max(0, VERIFY_MAX_SECONDS - secondsElapsed);
  const mm = Math.floor(remaining / 60);
  const ss = String(remaining % 60).padStart(2, '0');
  const isTimedOut = remaining === 0;

  const getTimerMessage = () => {
    if (secondsElapsed < 15) {
      return '💡 Payment करते ही link automatically यहाँ appear होगा। कृपया wait करें...';
    }
    if (secondsElapsed < 45) {
      return '🔍 FamApp alert से payment match कर रहे हैं... Usually 30-60 seconds लगते हैं।';
    }
    if (secondsElapsed < 90) {
      return '⏳ Almost there! आपका payment verify हो रहा है...';
    }
    if (secondsElapsed < 120) {
      return '🔔 Final check चल रही है... Link कुछ seconds में आ जाएगा।';
    }
    return '✋ थोड़ा ज़्यादा time लग रहा है। अगर payment हो गया है तो link कुछ देर में आ जाएगा। Problem हो तो Support से बात करें।';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-lg bg-[#0e0a19] border-t sm:border border-purple-900/70 rounded-t-3xl sm:rounded-3xl p-5 sm:p-7 shadow-2xl shadow-purple-950/90 text-left max-h-[92vh] overflow-y-auto"
        role="dialog"
        aria-modal="true"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-white rounded-full bg-zinc-900/70 hover:bg-zinc-800 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-600 to-violet-800 flex items-center justify-center shadow-md text-white">
            <QrCode className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-mono tracking-wider text-purple-400 font-semibold block">
              UPI Pay-Per-Movie Checkout
            </span>
            <h2 className="text-lg sm:text-xl font-bold text-white font-['Outfit']">
              {order?.status === 'verified' ? 'Purchase Complete' : 'Scan UPI QR to Buy'}
            </h2>
          </div>
        </div>

        {loading && (
          <div className="py-16 text-center space-y-3">
            <Loader2 className="w-8 h-8 text-purple-500 animate-spin mx-auto" />
            <p className="text-xs text-zinc-300 font-mono">
              Generating unique UPI payment order on backend...
            </p>
          </div>
        )}

        {error && (
          <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/60 text-xs text-rose-300 space-y-2 mb-4">
            <div className="flex items-center gap-2 font-semibold text-rose-200">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>Checkout Configuration Error</span>
            </div>
            <p className="leading-relaxed">{error}</p>
            <div className="pt-1">
              <button
                onClick={onClose}
                className="px-3 py-1.5 bg-rose-900/60 hover:bg-rose-800 text-white rounded-lg text-xs cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {order && !loading && (
          <div className="space-y-4">

            {/* VERIFIED STATE — Telegram Link */}
            {order.status === 'verified' && order.telegramInviteLink && (
              <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-950/60 to-purple-950/40 border-2 border-emerald-600/70 space-y-3">
                <div className="flex items-center gap-2 text-emerald-300 font-bold text-base">
                  <Check className="w-5 h-5" />
                  <span>Payment Verified!</span>
                </div>

                <p className="text-xs text-emerald-200/90 leading-relaxed">
                  Thank you! Your payment of <strong className="text-white">₹{order.payableAmount.toFixed(2)}</strong> has been verified.
                  Click below to join your exclusive Telegram channel.
                </p>

                <a
                  href={order.telegramInviteLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white font-bold text-sm shadow-lg shadow-emerald-950 transition-all flex items-center justify-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  <span>Join Telegram VIP Channel</span>
                  <ExternalLink className="w-4 h-4" />
                </a>

                <p className="text-[10px] text-emerald-300/70 text-center">
                  ⚠️ One-time link — Do not share. Expires after first use.
                </p>
              </div>
            )}

            {/* PENDING STATE — QR */}
            {order.status !== 'verified' && (
              <>
                <div className="p-3 rounded-xl bg-[#130d22] border border-purple-950/60 flex items-center justify-between text-xs">
                  <div className="min-w-0 pr-2">
                    <div className="font-bold text-white truncate font-['Outfit'] text-sm">
                      {order.movieTitle}
                    </div>
                    <div className="text-[10px] text-zinc-400 font-mono">
                      Order ID: <span className="text-purple-300 font-semibold">{order.orderId}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-[10px] text-zinc-500 block uppercase font-mono">Status</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-950/60 border border-amber-800/50 text-amber-300 font-semibold">
                      Awaiting Payment
                    </span>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-gradient-to-b from-[#160f29] to-[#0c0816] border border-purple-900/50 flex flex-col items-center text-center">
                  {qrDataUrl && (
                    <div className="p-4 bg-white rounded-2xl shadow-xl shadow-purple-950/80 mb-3 border border-purple-300/40 flex flex-col items-center">
                      <img
                        src={qrDataUrl}
                        alt={`UPI QR Code for ${order.movieTitle}`}
                        className="w-48 h-48 sm:w-52 sm:h-52 object-contain"
                      />
                      <div className="text-[10px] text-zinc-600 font-mono text-center mt-1">
                        Scan with any UPI App
                      </div>
                    </div>
                  )}

                  <div className="space-y-0.5 mb-2">
                    <span className="text-[11px] text-zinc-400 block font-medium">
                      Exact Amount to Pay
                    </span>
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-3xl sm:text-4xl font-extrabold text-white font-['Outfit'] tabular-nums tracking-tight">
                        ₹{order.payableAmount.toFixed(2)}
                      </span>
                      <button
                        onClick={handleCopyAmount}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-white bg-[#1f1538] hover:bg-purple-950 transition-colors cursor-pointer"
                      >
                        {copiedAmount ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 p-2 rounded-lg bg-[#0e0919] border border-purple-950/70 text-xs text-zinc-300">
                    <span className="text-zinc-500 font-mono text-[11px]">UPI VPA:</span>
                    <span className="font-mono text-purple-300 font-semibold">{order.upiVpa}</span>
                    <button
                      onClick={handleCopyVpa}
                      className="p-1 rounded text-zinc-400 hover:text-white transition-colors cursor-pointer"
                    >
                      {copiedVpa ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  {/* ============================================================ */}
                  {/* UPI DEEP LINK BUTTON (Batch 3 fixed)                         */}
                  {/* ============================================================ */}
                  <div className="w-full pt-3">
                    <button
                      type="button"
                      onClick={handleOpenUpiApp}
                      className="w-full min-h-[46px] py-2.5 px-4 rounded-xl bg-gradient-to-r from-purple-600 to-violet-700 hover:from-purple-500 hover:to-violet-600 text-white font-bold text-xs sm:text-sm shadow-md shadow-purple-950 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
                    >
                      <Smartphone className="w-4 h-4" />
                      <span>Pay via UPI App</span>
                      <ExternalLink className="w-4 h-4" />
                    </button>
                  </div>

                  {upiPhoneHint && (
                    <div className="w-full mt-2 p-2.5 rounded-lg bg-amber-950/50 border border-amber-800/60 text-[11px] text-amber-200 text-left leading-relaxed">
                      {upiPhoneHint}
                    </div>
                  )}

                  <p className="text-[10px] text-zinc-500 mt-2 text-center">
                    📱 On mobile? Deep link works. On desktop? Use the QR code above.
                  </p>

                  {/* LIVE VERIFICATION TIMER */}
                  <div
                    className={`w-full mt-3 p-3.5 rounded-xl border space-y-2 transition-all ${
                      isTimedOut
                        ? 'bg-gradient-to-r from-amber-950/60 to-rose-950/40 border-amber-700/60'
                        : 'bg-gradient-to-r from-purple-950/60 to-indigo-950/40 border-purple-800/50'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-purple-300 font-semibold flex items-center gap-1.5">
                        {!isTimedOut ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Verifying Payment</span>
                          </>
                        ) : (
                          <>
                            <Clock className="w-3.5 h-3.5 text-amber-400" />
                            <span className="text-amber-300">Still Verifying</span>
                          </>
                        )}
                      </span>
                      <span
                        className={`font-mono font-bold tabular-nums ${
                          isTimedOut ? 'text-amber-300' : 'text-purple-200'
                        }`}
                      >
                        {isTimedOut ? 'Just a moment...' : `${mm}:${ss}`}
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-300 leading-relaxed text-left">
                      {getTimerMessage()}
                    </p>
                    {isTimedOut && (
                      <a
                        href="https://t.me/Owner_helpbot"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300 font-medium"
                      >
                        <Send className="w-3 h-3" />
                        <span>Chat with Support (@Owner_helpbot)</span>
                      </a>
                    )}
                  </div>
                </div>

                {/* Diagnostics */}
                <div className="rounded-xl border border-purple-950/60 bg-[#100b1e] overflow-hidden text-xs">
                  <button
                    type="button"
                    onClick={() => setShowDiagnostics((prev) => !prev)}
                    className="w-full p-3 flex items-center justify-between text-zinc-300 hover:text-white transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2 text-[11px] font-mono text-purple-300">
                      <Code2 className="w-3.5 h-3.5" />
                      <span>UPI Payment Diagnostics</span>
                    </div>
                    {showDiagnostics ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>

                  {showDiagnostics && (
                    <div className="p-3 pt-0 border-t border-purple-950/40 space-y-2.5 text-[11px]">
                      <div className="p-2 rounded bg-black/60 border border-purple-950 text-zinc-300 font-mono text-[10px] break-all">
                        {order.upiPaymentUri}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Verified but no telegram link yet */}
            {order.status === 'verified' && !order.telegramInviteLink && (
              <div className="p-4 rounded-xl bg-purple-950/40 border border-purple-800/60 text-center space-y-2">
                <Check className="w-8 h-8 text-emerald-400 mx-auto" />
                <p className="text-sm font-semibold text-white">Payment Verified!</p>
                <p className="text-xs text-zinc-400">
                  Your Telegram link is being generated. Please wait a moment or refresh the page.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
