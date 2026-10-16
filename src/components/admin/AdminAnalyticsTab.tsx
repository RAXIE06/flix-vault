import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart3,
  TrendingUp,
  ShoppingCart,
  CheckCircle2,
  Clock,
  XCircle,
  RefreshCw,
  Loader2,
  Trophy,
  Film,
  Users,
  IndianRupee,
  AlertCircle,
  Package,
} from 'lucide-react';

interface MovieAnalytics {
  movieId: string;
  movieTitle: string;
  totalOrders: number;
  verifiedOrders: number;
  pendingOrders: number;
  expiredOrders: number;
  totalRevenue: number;
  uniqueBuyers: number;
}

interface AnalyticsData {
  success: boolean;
  totalRevenue: number;
  totalOrders: number;
  totalVerifiedOrders: number;
  totalPendingOrders: number;
  totalExpiredOrders: number;
  perMovie: MovieAnalytics[];
  lastUpdated: string;
}

export const AdminAnalyticsTab: React.FC = () => {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAnalytics = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      const res = await fetch('/api/admin/analytics', {
        credentials: 'include',
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Failed to load analytics (${res.status})`);
      }

      const result: AnalyticsData = await res.json();
      setData(result);
    } catch (err: any) {
      console.error('[Analytics] Load failed:', err);
      setError(err.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  const handleRefresh = () => {
    loadAnalytics(true);
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const formatDate = (dateStr: string): string => {
    try {
      return new Date(dateStr).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  // ============================================================
  // LOADING STATE
  // ============================================================
  if (loading) {
    return (
      <div className="py-20 text-center space-y-3">
        <Loader2 className="w-10 h-10 text-purple-500 animate-spin mx-auto" />
        <p className="text-xs text-zinc-400 font-mono">
          Loading analytics from server...
        </p>
      </div>
    );
  }

  // ============================================================
  // ERROR STATE
  // ============================================================
  if (error) {
    return (
      <div className="p-6 rounded-2xl bg-rose-950/30 border border-rose-800/60 space-y-3">
        <div className="flex items-center gap-2 text-rose-300 font-semibold">
          <AlertCircle className="w-5 h-5" />
          <span>Failed to Load Analytics</span>
        </div>
        <p className="text-xs text-rose-200/90">{error}</p>
        <button
          onClick={() => loadAnalytics()}
          className="px-4 py-2 rounded-xl bg-rose-900/60 hover:bg-rose-800 text-white text-xs font-semibold flex items-center gap-2 cursor-pointer transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Retry</span>
        </button>
      </div>
    );
  }

  // ============================================================
  // EMPTY STATE
  // ============================================================
  if (!data || data.totalOrders === 0) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-purple-400" />
              <h3 className="font-bold text-white text-lg font-['Outfit']">
                Sales Analytics
              </h3>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              Track your movie sales, revenue, and customer activity
            </p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="px-3.5 py-2 rounded-xl bg-[#140f24] border border-purple-950/70 hover:bg-purple-950/40 text-zinc-300 hover:text-white text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50 self-start sm:self-auto"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-purple-400' : ''}`} />
            <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>

        {/* Empty Card */}
        <div className="p-10 rounded-2xl bg-[#0e0a19] border border-purple-950/60 text-center space-y-3">
          <div className="w-16 h-16 rounded-full bg-purple-950/60 border border-purple-800/50 flex items-center justify-center mx-auto">
            <Package className="w-7 h-7 text-purple-400" />
          </div>
          <h4 className="text-base font-bold text-white font-['Outfit']">
            No Orders Yet
          </h4>
          <p className="text-xs text-zinc-400 max-w-md mx-auto leading-relaxed">
            Jab koi user movie kharidega, uska data yahan automatically show hoga — total revenue, movie-wise sales, aur buyer count.
          </p>
        </div>
      </div>
    );
  }

  // ============================================================
  // MAIN ANALYTICS VIEW
  // ============================================================
  const topMovie = data.perMovie.length > 0 ? data.perMovie[0] : null;
  const conversionRate =
    data.totalOrders > 0
      ? ((data.totalVerifiedOrders / data.totalOrders) * 100).toFixed(1)
      : '0.0';

  return (
    <div className="space-y-6">
      {/* ============================================================ */}
      {/* HEADER                                                       */}
      {/* ============================================================ */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-purple-400" />
            <h3 className="font-bold text-white text-lg font-['Outfit']">
              Sales Analytics
            </h3>
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">
            Live revenue and per-movie performance
          </p>
        </div>

        <div className="flex items-center gap-2">
          {data.lastUpdated && (
            <span className="text-[10px] text-zinc-500 font-mono hidden sm:inline">
              Updated: {formatDate(data.lastUpdated)}
            </span>
          )}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="px-3.5 py-2 rounded-xl bg-[#140f24] border border-purple-950/70 hover:bg-purple-950/40 text-zinc-300 hover:text-white text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-purple-400' : ''}`} />
            <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* ============================================================ */}
      {/* TOP PERFORMER CARD                                           */}
      {/* ============================================================ */}
      {topMovie && topMovie.totalRevenue > 0 && (
        <div className="p-5 rounded-2xl bg-gradient-to-br from-purple-950/40 via-[#140f24] to-[#0e0a19] border border-purple-700/50 shadow-lg shadow-purple-950/40 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-40 h-40 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />
          
          <div className="relative flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-950/60 shrink-0">
                <Trophy className="w-6 h-6 text-white" />
              </div>
              <div>
                <span className="text-[10px] uppercase font-mono tracking-wider text-amber-400 font-bold">
                  🏆 Top Performer
                </span>
                <h4 className="text-lg sm:text-xl font-extrabold text-white font-['Outfit'] mt-0.5">
                  {topMovie.movieTitle}
                </h4>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  {topMovie.verifiedOrders} paid · {topMovie.uniqueBuyers} unique buyer
                  {topMovie.uniqueBuyers !== 1 ? 's' : ''}
                </p>
              </div>
            </div>

            <div className="text-right">
              <span className="text-[10px] uppercase font-mono text-zinc-500 block">
                Revenue
              </span>
              <span className="text-2xl sm:text-3xl font-extrabold text-emerald-400 font-['Outfit'] tabular-nums">
                {formatCurrency(topMovie.totalRevenue)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* SUMMARY CARDS                                                */}
      {/* ============================================================ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Revenue */}
        <div className="p-4 rounded-xl bg-[#140f24] border border-emerald-900/50 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-mono text-zinc-500 tracking-wider">
              Total Revenue
            </span>
            <IndianRupee className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <p className="text-xl sm:text-2xl font-extrabold text-emerald-400 font-['Outfit'] tabular-nums leading-tight">
            {formatCurrency(data.totalRevenue)}
          </p>
          <p className="text-[10px] text-zinc-500 font-mono">
            {data.totalVerifiedOrders} verified payment{data.totalVerifiedOrders !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Total Orders */}
        <div className="p-4 rounded-xl bg-[#140f24] border border-purple-950/60 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-mono text-zinc-500 tracking-wider">
              Total Orders
            </span>
            <ShoppingCart className="w-3.5 h-3.5 text-purple-400" />
          </div>
          <p className="text-xl sm:text-2xl font-extrabold text-white font-['Outfit'] tabular-nums leading-tight">
            {data.totalOrders}
          </p>
          <p className="text-[10px] text-zinc-500 font-mono">
            Conversion: {conversionRate}%
          </p>
        </div>

        {/* Verified */}
        <div className="p-4 rounded-xl bg-[#140f24] border border-emerald-950/60 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-mono text-zinc-500 tracking-wider">
              Verified
            </span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <p className="text-xl sm:text-2xl font-extrabold text-emerald-300 font-['Outfit'] tabular-nums leading-tight">
            {data.totalVerifiedOrders}
          </p>
          <p className="text-[10px] text-zinc-500 font-mono">
            Successful payments
          </p>
        </div>

        {/* Pending + Expired */}
        <div className="p-4 rounded-xl bg-[#140f24] border border-amber-950/60 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-mono text-zinc-500 tracking-wider">
              Open / Expired
            </span>
            <Clock className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <p className="text-xl sm:text-2xl font-extrabold text-amber-300 font-['Outfit'] tabular-nums leading-tight">
            {data.totalPendingOrders + data.totalExpiredOrders}
          </p>
          <p className="text-[10px] text-zinc-500 font-mono">
            {data.totalPendingOrders} pending · {data.totalExpiredOrders} expired
          </p>
        </div>
      </div>

      {/* ============================================================ */}
      {/* PER-MOVIE TABLE                                              */}
      {/* ============================================================ */}
      <div className="p-5 sm:p-6 rounded-2xl bg-[#0e0a19] border border-purple-950/60 shadow-lg space-y-4">
        <div className="flex items-center justify-between border-b border-purple-950/50 pb-3">
          <div className="flex items-center gap-2">
            <Film className="w-4 h-4 text-purple-400" />
            <h4 className="font-bold text-white text-base font-['Outfit']">
              Per-Movie Sales Breakdown
            </h4>
          </div>
          <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-purple-950/80 border border-purple-800/50 text-purple-300 font-semibold">
            {data.perMovie.length} movie{data.perMovie.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Desktop Table */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-zinc-500 font-mono border-b border-purple-950/50">
                <th className="text-left py-2.5 px-3 font-semibold">Movie</th>
                <th className="text-center py-2.5 px-3 font-semibold">Total</th>
                <th className="text-center py-2.5 px-3 font-semibold">Verified</th>
                <th className="text-center py-2.5 px-3 font-semibold">Pending</th>
                <th className="text-center py-2.5 px-3 font-semibold">Expired</th>
                <th className="text-center py-2.5 px-3 font-semibold">Buyers</th>
                <th className="text-right py-2.5 px-3 font-semibold">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {data.perMovie.map((movie) => (
                <tr
                  key={movie.movieId}
                  className="border-b border-purple-950/30 hover:bg-purple-950/10 transition-colors"
                >
                  <td className="py-3 px-3">
                    <div className="font-semibold text-white truncate max-w-xs">
                      {movie.movieTitle}
                    </div>
                    <div className="text-[10px] text-zinc-500 font-mono">
                      {movie.movieId}
                    </div>
                  </td>
                  <td className="py-3 px-3 text-center text-zinc-300 font-mono tabular-nums">
                    {movie.totalOrders}
                  </td>
                  <td className="py-3 px-3 text-center">
                    <span className="inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 rounded-md bg-emerald-950/70 border border-emerald-800/50 text-emerald-300 font-mono font-bold text-[11px]">
                      {movie.verifiedOrders}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-center text-zinc-400 font-mono tabular-nums">
                    {movie.pendingOrders}
                  </td>
                  <td className="py-3 px-3 text-center text-zinc-500 font-mono tabular-nums">
                    {movie.expiredOrders}
                  </td>
                  <td className="py-3 px-3 text-center">
                    <div className="flex items-center justify-center gap-1 text-zinc-300 font-mono tabular-nums">
                      <Users className="w-3 h-3 text-zinc-500" />
                      {movie.uniqueBuyers}
                    </div>
                  </td>
                  <td className="py-3 px-3 text-right">
                    <span
                      className={`font-mono font-bold tabular-nums ${
                        movie.totalRevenue > 0 ? 'text-emerald-400' : 'text-zinc-600'
                      }`}
                    >
                      {formatCurrency(movie.totalRevenue)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards */}
        <div className="lg:hidden space-y-3">
          {data.perMovie.map((movie) => (
            <div
              key={movie.movieId}
              className="p-4 rounded-xl bg-[#140f24] border border-purple-950/50 space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h5 className="font-bold text-white text-sm truncate">
                    {movie.movieTitle}
                  </h5>
                  <p className="text-[10px] text-zinc-500 font-mono">
                    {movie.movieId}
                  </p>
                </div>
                <span className="text-base font-extrabold text-emerald-400 font-['Outfit'] tabular-nums shrink-0">
                  {formatCurrency(movie.totalRevenue)}
                </span>
              </div>

              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="p-2 rounded-lg bg-[#0e0a19] border border-purple-950/40">
                  <div className="text-[9px] uppercase font-mono text-zinc-500">Total</div>
                  <div className="text-sm font-bold text-white font-mono tabular-nums">
                    {movie.totalOrders}
                  </div>
                </div>
                <div className="p-2 rounded-lg bg-emerald-950/30 border border-emerald-900/40">
                  <div className="text-[9px] uppercase font-mono text-emerald-500">Verified</div>
                  <div className="text-sm font-bold text-emerald-300 font-mono tabular-nums">
                    {movie.verifiedOrders}
                  </div>
                </div>
                <div className="p-2 rounded-lg bg-blue-950/30 border border-blue-900/40">
                  <div className="text-[9px] uppercase font-mono text-blue-500">Pending</div>
                  <div className="text-sm font-bold text-blue-300 font-mono tabular-nums">
                    {movie.pendingOrders}
                  </div>
                </div>
                <div className="p-2 rounded-lg bg-zinc-900/40 border border-zinc-800/50">
                  <div className="text-[9px] uppercase font-mono text-zinc-500">Buyers</div>
                  <div className="text-sm font-bold text-zinc-300 font-mono tabular-nums">
                    {movie.uniqueBuyers}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ============================================================ */}
      {/* INFO FOOTER                                                  */}
      {/* ============================================================ */}
      <div className="p-3.5 rounded-xl bg-purple-950/20 border border-purple-900/40 text-[11px] text-zinc-400 leading-relaxed flex items-start gap-2">
        <TrendingUp className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
        <div>
          <span className="text-zinc-300 font-semibold">Note: </span>
          <span>
            Revenue sirf <strong className="text-emerald-400">verified</strong> orders se count kiya jaata hai.
            Pending aur expired orders revenue mein include nahi hain. Unique buyers = alag-alag UTR counts.
          </span>
        </div>
      </div>
    </div>
  );
};
