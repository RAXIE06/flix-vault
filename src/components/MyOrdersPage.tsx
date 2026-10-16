import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Check,
  Clock,
  ExternalLink,
  Send,
  Search,
  Loader2,
  AlertCircle,
  Package,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { UserOrderRecord } from '../types';

interface MyOrdersPageProps {
  onBack: () => void;
}

const STORAGE_KEY = 'flixvault_my_orders';

function loadOrdersFromStorage(): UserOrderRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveOrdersToStorage(orders: UserOrderRecord[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
  } catch {
    // Ignore
  }
}

export const MyOrdersPage: React.FC<MyOrdersPageProps> = ({ onBack }) => {
  const [orders, setOrders] = useState<UserOrderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchOrderId, setSearchOrderId] = useState('');
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);

  // Load orders from localStorage and refresh from server
  useEffect(() => {
    const localOrders = loadOrdersFromStorage();
    setOrders(localOrders);
    setLoading(false);

    // Background refresh from server
    if (localOrders.length > 0) {
      refreshFromServer(localOrders);
    }
  }, []);

  const refreshFromServer = async (localOrders: UserOrderRecord[]) => {
    try {
      setRefreshing(true);
      const orderIds = localOrders.map((o) => o.orderId);

      const res = await fetch('/api/orders/recover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderIds }),
      });

      if (!res.ok) return;

      const data = await res.json();
      if (data.success && Array.isArray(data.orders)) {
        const updated: UserOrderRecord[] = data.orders.map((o: any) => ({
          orderId: o.orderId,
          movieId: o.movieId,
          movieTitle: o.movieTitle,
          payableAmount: o.payableAmount,
          status: o.status,
          telegramInviteLink: o.telegramInviteLink,
          verifiedAt: o.verifiedAt,
          createdAt: o.createdAt,
          savedAt: Date.now(),
        }));

        // Merge: keep any local orders not returned by server
        const serverIds = new Set(updated.map((o) => o.orderId));
        const stillLocal = localOrders.filter((o) => !serverIds.has(o.orderId));
        const merged = [...updated, ...stillLocal];

        setOrders(merged);
        saveOrdersToStorage(merged);
      }
    } catch (err) {
      console.warn('Server refresh failed:', err);
    } finally {
      setRefreshing(false);
    }
  };

  const handleManualRefresh = () => {
    if (orders.length > 0) {
      refreshFromServer(orders);
    }
  };

  const handleSearchByOrderId = async (e: React.FormEvent) => {
    e.preventDefault();
    setSearchError(null);
    const cleanId = searchOrderId.trim().toUpperCase();
    if (!cleanId) {
      setSearchError('Please enter an Order ID');
      return;
    }

    if (orders.some((o) => o.orderId === cleanId)) {
      setSearchError('This order is already in your list');
      return;
    }

    setSearchLoading(true);
    try {
      const res = await fetch('/api/orders/recover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderIds: [cleanId] }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Could not find order');
      }

      if (!data.orders || data.orders.length === 0) {
        throw new Error('No order found with this ID');
      }

      const found = data.orders[0];
      const record: UserOrderRecord = {
        orderId: found.orderId,
        movieId: found.movieId,
        movieTitle: found.movieTitle,
        payableAmount: found.payableAmount,
        status: found.status,
        telegramInviteLink: found.telegramInviteLink,
        verifiedAt: found.verifiedAt,
        createdAt: found.createdAt,
        savedAt: Date.now(),
      };

      const updated = [record, ...orders];
      setOrders(updated);
      saveOrdersToStorage(updated);
      setSearchOrderId('');
    } catch (err: any) {
      setSearchError(err.message || 'Could not find order');
    } finally {
      setSearchLoading(false);
    }
  };

  const handleRemoveOrder = (orderId: string) => {
    const updated = orders.filter((o) => o.orderId !== orderId);
    setOrders(updated);
    saveOrdersToStorage(updated);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'verified':
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase tracking-wide bg-emerald-950/90 border border-emerald-700/60 text-emerald-300 flex items-center gap-1">
            <Check className="w-3 h-3" />
            Verified
          </span>
        );
      case 'pending':
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase tracking-wide bg-blue-950/80 border border-blue-800/50 text-blue-300 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Pending
          </span>
        );
      case 'expired':
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase tracking-wide bg-zinc-900 border border-zinc-700/60 text-zinc-400 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Expired
          </span>
        );
      case 'needs_review':
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase tracking-wide bg-amber-950/90 border border-amber-700/60 text-amber-300 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            Review
          </span>
        );
      case 'failed':
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase tracking-wide bg-rose-950/90 border border-rose-700/60 text-rose-300 flex items-center gap-1">
            <XCircle className="w-3 h-3" />
            Failed
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6 text-left">
      {/* Back button + Title */}
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400 hover:text-white transition-colors cursor-pointer px-3 py-2 rounded-lg hover:bg-purple-950/40"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Home</span>
        </button>

        <button
          onClick={handleManualRefresh}
          disabled={refreshing || orders.length === 0}
          className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400 hover:text-white transition-colors cursor-pointer px-3 py-2 rounded-lg hover:bg-purple-950/40 disabled:opacity-40"
          title="Refresh order status"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-purple-400' : ''}`} />
          <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
        </button>
      </div>

      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-purple-400">
          <Package className="w-4 h-4" />
          <span>My Purchase History</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-white font-['Outfit']">
          My Orders
        </h1>
        <p className="text-xs sm:text-sm text-zinc-400">
          All your purchased movies are saved here. Click any verified order to re-open its Telegram channel link.
        </p>
      </div>

      {/* Search by Order ID */}
      <div className="p-4 rounded-xl bg-[#0e0a19] border border-purple-950/60 space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-semibold text-white">Recover an order by Order ID</span>
        </div>
        <form onSubmit={handleSearchByOrderId} className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={searchOrderId}
            onChange={(e) => {
              setSearchOrderId(e.target.value);
              if (searchError) setSearchError(null);
            }}
            placeholder="e.g. FLX-MV9HMH-LKXM"
            className="flex-1 px-3 py-2.5 bg-[#140f24] border border-purple-950/70 focus:border-purple-500 rounded-xl text-xs sm:text-sm text-white placeholder-zinc-500 font-mono focus:outline-none"
          />
          <button
            type="submit"
            disabled={searchLoading}
            className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:bg-purple-950 disabled:text-zinc-500 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            {searchLoading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Searching...</span>
              </>
            ) : (
              <>
                <Search className="w-3.5 h-3.5" />
                <span>Find Order</span>
              </>
            )}
          </button>
        </form>
        {searchError && (
          <div className="flex items-center gap-2 text-[11px] text-rose-300 bg-rose-950/40 border border-rose-800/60 px-3 py-2 rounded-lg">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{searchError}</span>
          </div>
        )}
      </div>

      {/* Orders list */}
      {loading ? (
        <div className="py-16 text-center space-y-3">
          <Loader2 className="w-8 h-8 text-purple-500 animate-spin mx-auto" />
          <p className="text-xs text-zinc-400 font-mono">Loading your orders...</p>
        </div>
      ) : orders.length === 0 ? (
        <div className="py-16 text-center space-y-3 p-6 rounded-2xl bg-[#0e0a19] border border-purple-950/60">
          <Package className="w-12 h-12 text-zinc-600 mx-auto" />
          <h3 className="text-base font-bold text-white font-['Outfit']">
            No Orders Yet
          </h3>
          <p className="text-xs text-zinc-400 max-w-sm mx-auto leading-relaxed">
            You haven&apos;t purchased any movies yet. Buy one to see it here for future access.
          </p>
          <button
            onClick={onBack}
            className="mt-2 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-violet-700 hover:from-purple-500 hover:to-violet-600 text-white text-xs font-semibold cursor-pointer transition-colors"
          >
            Browse Movies
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => {
            const isVerified = order.status === 'verified';
            const hasLink = !!order.telegramInviteLink;

            return (
              <div
                key={order.orderId}
                className={`rounded-2xl p-4 sm:p-5 border transition-all ${
                  isVerified
                    ? 'bg-gradient-to-br from-emerald-950/20 to-[#0e0a19] border-emerald-800/50'
                    : 'bg-[#0e0a19] border-purple-950/60'
                }`}
              >
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold text-white text-base font-['Outfit'] truncate">
                        {order.movieTitle}
                      </h3>
                      {getStatusBadge(order.status)}
                    </div>
                    <div className="text-[11px] text-zinc-400 font-mono flex flex-wrap items-center gap-x-2">
                      <span>
                        Order: <strong className="text-purple-300">{order.orderId}</strong>
                      </span>
                      <span>·</span>
                      <span className="text-white font-bold">
                        ₹{order.payableAmount.toFixed(2)}
                      </span>
                      {order.verifiedAt && (
                        <>
                          <span>·</span>
                          <span>
                            Verified: {new Date(order.verifiedAt).toLocaleDateString()}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                    {isVerified && hasLink ? (
                      <a
                        href={order.telegramInviteLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Join Channel</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : isVerified && !hasLink ? (
                      <span className="text-[10px] text-emerald-300 font-mono px-2 py-1 rounded-md bg-emerald-950/40 border border-emerald-800/40">
                        Link generating...
                      </span>
                    ) : (
                      <span className="text-[10px] text-zinc-500 font-mono px-2 py-1 rounded-md bg-zinc-900/60 border border-zinc-800">
                        Payment pending
                      </span>
                    )}

                    <button
                      onClick={() => handleRemoveOrder(order.orderId)}
                      className="p-2 text-zinc-500 hover:text-rose-400 hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
                      title="Remove from my list"
                    >
                      <XCircle className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer hint */}
      {orders.length > 0 && (
        <div className="p-3.5 rounded-xl bg-purple-950/20 border border-purple-900/40 text-[11px] text-zinc-400 leading-relaxed text-center">
          💾 Ye orders tumhare browser mein save rehte hain. Same browser se wapas aaoge toh list yahin milegi.
        </div>
      )}
    </div>
  );
};
