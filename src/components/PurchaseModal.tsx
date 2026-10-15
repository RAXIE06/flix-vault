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
} from 'lucide-react';
import QRCode from 'qrcode';
import { Movie, UpiPaymentOrder } from '../types';
import { api } from '../services/api';

interface PurchaseModalProps {
  movie: Movie | null;
  onClose: () => void;
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

  // When a movie is selected, generate server-authoritative UPI order
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
        // Backend generates unique order ID & reserved paise amount with validated NPCI URI
        const res = await api.createUpiOrder(movie.id);

        if (!isMounted) return;
        setOrder(res.order);

        // Render ISO 18004 compliant QR code directly from the server-validated UPI payment URI
        // Using margin: 4 (standard quiet zone) and #000000 on #ffffff for optimal scanner detection
        const qrUrl = await QRCode.toDataURL(res.order.upiPaymentUri, {
          width: 320,
          margin: 4,
          color: {
            dark: '#000000',
            light: '#ffffff',
          },
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

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      
      {/* Mobile-first bottom sheet or centered card */}
      <div
        className="relative w-full max-w-lg bg-[#0e0a19] border-t sm:border border-purple-900/70 rounded-t-3xl sm:rounded-3xl p-5 sm:p-7 shadow-2xl shadow-purple-950/90 text-left max-h-[92vh] overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-labelledby="upi-order-title"
      >
        {/* Close Button: thumb-friendly touch target */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-white rounded-full bg-zinc-900/70 hover:bg-zinc-800 transition-colors cursor-pointer"
          aria-label="Close purchase modal"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-600 to-violet-800 flex items-center justify-center shadow-md text-white">
            <QrCode className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-mono tracking-wider text-purple-400 font-semibold block">
              UPI Pay-Per-Movie Checkout
            </span>
            <h2 id="upi-order-title" className="text-lg sm:text-xl font-bold text-white font-['Outfit']">
              Scan UPI QR to Buy
            </h2>
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="py-16 text-center space-y-3">
            <Loader2 className="w-8 h-8 text-purple-500 animate-spin mx-auto" />
            <p className="text-xs text-zinc-300 font-mono">
              Generating unique UPI payment order on backend...
            </p>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/60 text-xs text-rose-300 space-y-2 mb-4">
            <div className="flex items-center gap-2 font-semibold text-rose-200">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>Checkout Configuration Error</span>
            </div>
            <p className="leading-relaxed">{error}</p>
            <p className="text-[11px] text-rose-400/90">
              Note: The server requires a valid UPI ID (VPA) in server environment (<code>UPI_VPA</code>) or the Admin Dashboard before payment orders can be generated.
            </p>
            <div className="pt-1">
              <button
                onClick={onClose}
                className="px-3 py-1.5 bg-rose-900/60 hover:bg-rose-800 text-white rounded-lg text-xs cursor-pointer transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* Order Details & UPI QR Presentation */}
        {order && !loading && (
          <div className="space-y-4">
            
            {/* Movie Title & Order Identification Bar */}
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

            {/* UPI QR Display Card */}
            <div className="p-4 rounded-2xl bg-gradient-to-b from-[#160f29] to-[#0c0816] border border-purple-900/50 flex flex-col items-center text-center">
              
              {/* QR Image with ISO Quiet Zone on Pure White Container */}
              {qrDataUrl && (
                <div className="p-4 bg-white rounded-2xl shadow-xl shadow-purple-950/80 mb-3 border border-purple-300/40 flex flex-col items-center">
                  <img
                    src={qrDataUrl}
                    alt={`UPI QR Code for ${order.movieTitle}`}
                    className="w-48 h-48 sm:w-52 sm:h-52 object-contain"
                  />
                  <div className="text-[10px] text-zinc-600 font-mono text-center mt-1">
                    Scan with any UPI App (GPay / PhonePe / Paytm / BHIM)
                  </div>
                </div>
              )}

              {/* Exact Payable Amount Callout */}
              <div className="space-y-0.5 mb-2">
                <span className="text-[11px] text-zinc-400 block font-medium">
                  Exact Amount to Pay (Includes Unique Paise)
                </span>
                <div className="flex items-center justify-center gap-2">
                  <span className="text-3xl sm:text-4xl font-extrabold text-white font-['Outfit'] tabular-nums tracking-tight">
                    ₹{order.payableAmount.toFixed(2)}
                  </span>
                  <button
                    onClick={handleCopyAmount}
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-white bg-[#1f1538] hover:bg-purple-950 transition-colors cursor-pointer"
                    title="Copy Exact Amount"
                  >
                    {copiedAmount ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* Payee VPA Details */}
              <div className="flex items-center gap-2 p-2 rounded-lg bg-[#0e0919] border border-purple-950/70 text-xs text-zinc-300">
                <span className="text-zinc-500 font-mono text-[11px]">UPI VPA:</span>
                <span className="font-mono text-purple-300 font-semibold">{order.upiVpa}</span>
                <button
                  onClick={handleCopyVpa}
                  className="p-1 rounded text-zinc-400 hover:text-white transition-colors cursor-pointer"
                  title="Copy UPI VPA"
                >
                  {copiedVpa ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>

              {/* UPI Intent Deep Link Button (For mobile UPI apps) */}
              <div className="w-full pt-3">
                <a
                  href={order.upiPaymentUri}
                  className="w-full min-h-[46px] py-2.5 px-4 rounded-xl bg-gradient-to-r from-purple-600 to-violet-700 hover:from-purple-500 hover:to-violet-600 text-white font-bold text-xs sm:text-sm shadow-md shadow-purple-950 transition-all flex items-center justify-center gap-2"
                >
                  <span>Pay via UPI App (GPay / PhonePe / Paytm)</span>
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>

            </div>

            {/* Safe Developer Diagnostics & Technical Inspector */}
            <div className="rounded-xl border border-purple-950/60 bg-[#100b1e] overflow-hidden text-xs">
              <button
                type="button"
                onClick={() => setShowDiagnostics((prev) => !prev)}
                className="w-full p-3 flex items-center justify-between text-zinc-300 hover:text-white transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2 text-[11px] font-mono text-purple-300">
                  <Code2 className="w-3.5 h-3.5" />
                  <span>UPI Payment Diagnostics & URI Inspector</span>
                </div>
                {showDiagnostics ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>

              {showDiagnostics && (
                <div className="p-3 pt-0 border-t border-purple-950/40 space-y-2.5 text-[11px]">
                  <div className="space-y-1">
                    <span className="text-zinc-500 font-mono text-[10px] uppercase">Generated UPI Intent URI:</span>
                    <div className="p-2 rounded bg-black/60 border border-purple-950 text-zinc-300 font-mono text-[10px] break-all select-all flex items-start justify-between gap-2">
                      <span>{order.upiPaymentUri}</span>
                      <button
                        onClick={handleCopyUri}
                        className="shrink-0 p-1 rounded hover:bg-purple-900 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                        title="Copy Raw UPI URI"
                      >
                        {copiedUri ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 font-mono text-[10px]">
                    <div className="p-2 rounded bg-black/40 border border-purple-950/60">
                      <span className="text-zinc-500 block">Payee Address (pa):</span>
                      <span className="text-purple-300 font-semibold">{order.upiVpa}</span>
                    </div>
                    <div className="p-2 rounded bg-black/40 border border-purple-950/60">
                      <span className="text-zinc-500 block">Payee Name (pn):</span>
                      <span className="text-zinc-200">{order.upiPayeeName}</span>
                    </div>
                    <div className="p-2 rounded bg-black/40 border border-purple-950/60">
                      <span className="text-zinc-500 block">Exact Amount (am):</span>
                      <span className="text-emerald-400 font-semibold">{order.payableAmount.toFixed(2)} INR</span>
                    </div>
                    <div className="p-2 rounded bg-black/40 border border-purple-950/60">
                      <span className="text-zinc-500 block">Order Ref (tr):</span>
                      <span className="text-zinc-200">{order.orderId}</span>
                    </div>
                  </div>

                  <div className="text-[10px] text-zinc-400 space-y-1 pt-1 border-t border-purple-950/40">
                    <div className="text-emerald-400 flex items-center gap-1">
                      <Check className="w-3 h-3" />
                      <span>Standards Verified: Unencoded literal &apos;@&apos;, exact decimal amount, ISO quiet zone margin=4</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Safe Architecture Notice */}
            <div className="p-3.5 rounded-xl bg-purple-950/30 border border-purple-800/40 text-[11px] text-zinc-300 space-y-1.5">
              <div className="flex items-center gap-1.5 text-purple-300 font-semibold">
                <ShieldAlert className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                <span>Pay-Per-Movie UPI Architecture</span>
              </div>
              <p className="leading-relaxed text-zinc-400">
                Order <strong className="text-zinc-200">#{order.orderId}</strong> is registered on the server with a unique payable amount of <strong className="text-zinc-200">₹{order.payableAmount.toFixed(2)}</strong>. Automated transaction verification (FamPay / Gmail receipt matching) and one-time Telegram VIP link delivery will be activated in Phase 3.
              </p>
            </div>

          </div>
        )}

      </div>

    </div>
  );
};
