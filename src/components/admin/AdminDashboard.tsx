import React, { useState, useEffect } from 'react';
import {
  Film,
  Plus,
  Edit2,
  Trash2,
  ArrowLeft,
  ShieldAlert,
  Star,
  Sliders,
  Send,
  QrCode,
  Smartphone,
  ExternalLink,
  CheckCircle2,
  Clock,
  RefreshCw,
  Mail,
  Zap,
  AlertTriangle,
  XCircle,
  HelpCircle,
  ShieldCheck,
  LogOut,
} from 'lucide-react';
import {
  Movie,
  TelegramConfig,
  UpiPaymentOrder,
  UpiConfig,
  PaymentVerificationScanResponse,
} from '../../types';
import { MoviePosterArt } from '../MoviePosterArt';
import { MovieEditModal } from './MovieEditModal';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { MobilePreviewModal } from './MobilePreviewModal';
import { TelegramConfigSection } from './TelegramConfigSection';
import { GmailVerificationSection } from './GmailVerificationSection';
import { api } from '../../services/api';

interface AdminDashboardProps {
  movies: Movie[];
  onAddMovie: (movie: Movie) => void;
  onUpdateMovie: (movie: Movie) => void;
  onDeleteMovie: (movieId: string) => void;
  onSetFeatured: (movieId: string) => void;
  onToggleEnabled: (movieId: string) => void;
  telegramConfig: TelegramConfig;
  onUpdateTelegramConfig: (updated: Partial<TelegramConfig>) => void;
  onExit: () => void;
  onLogout?: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  movies,
  onAddMovie,
  onUpdateMovie,
  onDeleteMovie,
  onSetFeatured,
  onToggleEnabled,
  telegramConfig,
  onUpdateTelegramConfig,
  onExit,
  onLogout,
}) => {
  const [activeTab, setActiveTab] = useState<'movies' | 'storefront' | 'upi' | 'telegram' | 'gmail'>('movies');

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingMovie, setEditingMovie] = useState<Movie | null>(null);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [movieToDelete, setMovieToDelete] = useState<Movie | null>(null);

  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewMovie, setPreviewMovie] = useState<Movie | null>(null);

  const [notification, setNotification] = useState<string | null>(null);

  const [upiOrders, setUpiOrders] = useState<UpiPaymentOrder[]>([]);
  const [upiConfig, setUpiConfig] = useState<UpiConfig>({
    upiVpa: 'flixvault@upi',
    payeeName: 'FlixVault Cinema',
    paiseMinRange: 1,
    paiseMaxRange: 99,
  });
  const [upiVpaDraft, setUpiVpaDraft] = useState('');
  const [upiPayeeDraft, setUpiPayeeDraft] = useState('');
  const [loadingOrders, setLoadingOrders] = useState(false);

  const activeEnabledCount = movies.filter((m) => m.isEnabled !== false).length;
  const currentFeaturedMovie =
    movies.find((m) => m.isFeatured && m.isEnabled !== false) ||
    movies.find((m) => m.isEnabled !== false);

  const [dbStatus, setDbStatus] = useState<any>(null);
  const [retryingDb, setRetryingDb] = useState(false);

  useEffect(() => {
    loadDbStatus();
  }, []);

  const loadDbStatus = async () => {
    try {
      const res = await api.getDbStatus();
      setDbStatus(res.dbStatus);
    } catch {
      // Ignore
    }
  };

  const handleRetryDb = async () => {
    setRetryingDb(true);
    try {
      const res = await api.retryDbConnection();
      setDbStatus(res.dbStatus);
      if (res.dbStatus?.connected) {
        setNotification('✅ Successfully connected to MongoDB Atlas!');
      } else {
        setNotification(`⚠️ Connection attempt: ${res.dbStatus?.error || 'Could not connect'}`);
      }
    } catch (err: any) {
      setNotification(`Retry error: ${err.message}`);
    } finally {
      setRetryingDb(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'upi') {
      loadUpiData();
    }
  }, [activeTab]);

  const loadUpiData = async () => {
    setLoadingOrders(true);
    try {
      const [ordersRes, configRes] = await Promise.all([
        api.getAdminOrders(),
        api.getUpiConfig(),
      ]);
      setUpiOrders(ordersRes.orders || []);
      setUpiConfig(configRes.upiConfig);
      setUpiVpaDraft(configRes.upiConfig.upiVpa);
      setUpiPayeeDraft(configRes.upiConfig.payeeName);
    } catch (err) {
      console.error('Failed to load UPI orders/config:', err);
    } finally {
      setLoadingOrders(false);
    }
  };

  const handleSaveUpiConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.updateUpiConfig({
        upiVpa: upiVpaDraft.trim(),
        payeeName: upiPayeeDraft.trim(),
      });
      setUpiConfig(res.upiConfig);
      setNotification('UPI Payee configuration updated successfully on server.');
    } catch (err: any) {
      setNotification(`Failed to update UPI settings: ${err.message}`);
    }
  };

  const [verifyingPayments, setVerifyingPayments] = useState(false);
  const [verificationSummary, setVerificationSummary] = useState<PaymentVerificationScanResponse | null>(null);

  const handleVerifyPayments = async () => {
    setVerifyingPayments(true);
    try {
      const res = await api.verifyPayments(25);
      setVerificationSummary(res);
      await loadUpiData();
      if (res.ordersVerifiedCount > 0) {
        setNotification(`✅ Verified ${res.ordersVerifiedCount} payment(s) automatically from FamApp alerts.`);
      } else if (res.ordersNeedsReviewCount > 0) {
        setNotification(`⚠️ ${res.ordersNeedsReviewCount} order(s) flagged for admin review.`);
      } else if (res.duplicatesRejectedCount > 0) {
        setNotification(`⚠️ Rejected ${res.duplicatesRejectedCount} duplicate transaction(s).`);
      } else {
        setNotification(`Payment scan complete: ${res.scannedEmailsCount} email(s) inspected, no new matches.`);
      }
    } catch (err: any) {
      setNotification(`Verification error: ${err.message || 'Failed to verify payments'}`);
    } finally {
      setVerifyingPayments(false);
    }
  };

  const handleOpenAdd = () => {
    setEditingMovie(null);
    setEditModalOpen(true);
  };

  const handleOpenEdit = (movie: Movie) => {
    setEditingMovie(movie);
    setEditModalOpen(true);
  };

  const handleOpenDelete = (movie: Movie) => {
    setMovieToDelete(movie);
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = () => {
    if (movieToDelete) {
      onDeleteMovie(movieToDelete.id);
      setNotification(`"${movieToDelete.title}" was removed from the catalog.`);
      setDeleteModalOpen(false);
      setMovieToDelete(null);
    }
  };

  const handleOpenPreview = (movie: Movie) => {
    setPreviewMovie(movie);
    setPreviewModalOpen(true);
  };

  const handleSaveMovie = (savedMovie: Movie) => {
    if (editingMovie) {
      onUpdateMovie(savedMovie);
      setNotification(`Updated "${savedMovie.title}". Changes are live on the storefront!`);
    } else {
      onAddMovie(savedMovie);
      setNotification(`Published "${savedMovie.title}" to the FlixVault catalog!`);
    }
  };

  return (
    <div className="min-h-screen bg-[#07060b] text-zinc-100 flex flex-col font-['Plus_Jakarta_Sans']">
      
      {/* Admin Top Navigation Bar */}
      <header className="sticky top-0 z-30 bg-[#0d0917]/95 backdrop-blur-md border-b border-purple-950/60 px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onExit}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-purple-950/50 transition-colors flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
            title="Return to the live FlixVault storefront"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Storefront</span>
          </button>
          
          <div className="h-4 w-px bg-purple-950" />
          
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-white font-['Outfit']">
              Flix<span className="text-purple-400">Vault</span>
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider bg-purple-950/90 border border-purple-800/40 text-purple-300 font-semibold">
              Admin Portal
            </span>
            {dbStatus?.connected ? (
              <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-950/80 border border-emerald-800/50 text-emerald-400 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                MongoDB Atlas Active
              </span>
            ) : (
              <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono bg-amber-950/80 border border-amber-800/50 text-amber-300 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                {dbStatus?.isIpWhitelistIssue ? 'Atlas Whitelist Pending' : 'Resilient Fallback Mode'}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-2.5">
          <button
            onClick={onExit}
            className="px-3 sm:px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-gradient-to-r from-purple-600 to-violet-700 hover:from-purple-500 hover:to-violet-600 text-white transition-all shadow-md shadow-purple-950 flex items-center gap-1.5 cursor-pointer"
          >
            <span>View Storefront</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>

          {onLogout && (
            <button
              onClick={onLogout}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-zinc-900/90 hover:bg-rose-950/80 border border-zinc-700/60 hover:border-rose-700/80 text-zinc-300 hover:text-rose-200 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
              title="Logout and lock admin portal"
            >
              <LogOut className="w-3.5 h-3.5 text-rose-400" />
              <span>Lock &amp; Exit</span>
            </button>
          )}
        </div>
      </header>

      {/* Status Banner */}
      <div className="bg-amber-950/40 border-b border-amber-800/50 px-4 sm:px-8 py-2.5 text-xs text-amber-200 flex items-start sm:items-center gap-2.5 text-left">
        <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5 sm:mt-0" />
        <div className="flex-1">
          <strong className="font-semibold text-amber-300">UPI Pay-Per-Movie Architecture: </strong>
          <span>
            FlixVault operates strictly on a pay-per-movie model. All orders generate unique payable amounts via UPI. Subscriptions have been completely removed.
          </span>
        </div>
      </div>

      {/* Main Workspace */}
      <main className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full text-left space-y-6">
        
        {notification && (
          <div className="p-3.5 rounded-xl bg-purple-950/50 border border-purple-700/60 text-xs text-purple-200 flex items-center justify-between gap-3 animate-in fade-in">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{notification}</span>
            </div>
            <button
              onClick={() => setNotification(null)}
              className="text-zinc-400 hover:text-white p-1 text-xs cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {dbStatus?.isIpWhitelistIssue && (
          <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-700/60 text-xs text-amber-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-in fade-in">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold text-amber-300 text-sm">MongoDB Atlas Access Pending: IP Whitelist Required</p>
                <p className="text-xs text-amber-200/90 leading-relaxed">
                  Cloud hosting containers use dynamic outbound IPs. To connect FlixVault to your MongoDB Atlas cluster:
                  in MongoDB Atlas, navigate to <strong className="text-white">Network Access</strong> &rarr; <strong className="text-white">IP Access List</strong> &rarr; <strong className="text-white">Add IP Address</strong> &rarr; select <strong className="text-white">Allow Access from Anywhere (0.0.0.0/0)</strong>.
                </p>
                <p className="text-[11px] text-amber-400/80">
                  Note: While connecting, FlixVault operates seamlessly on its fallback store so storefront, movies, and UPI checkout remain active.
                </p>
              </div>
            </div>
            <button
              onClick={handleRetryDb}
              disabled={retryingDb}
              className="px-3.5 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 active:bg-amber-700 text-white font-semibold text-xs flex items-center gap-2 transition-all shrink-0 cursor-pointer disabled:opacity-50 shadow-md shadow-amber-950"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${retryingDb ? 'animate-spin' : ''}`} />
              <span>{retryingDb ? 'Connecting...' : 'Retry Connection'}</span>
            </button>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between border-b border-purple-950/60 pb-4 gap-3">
          <div className="flex items-center gap-1.5 bg-[#120d20] p-1 rounded-xl border border-purple-950/50 overflow-x-auto">
            <button
              onClick={() => setActiveTab('movies')}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'movies'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Film className="w-3.5 h-3.5" />
              <span>Movie Management ({movies.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('storefront')}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'storefront'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Storefront ({activeEnabledCount} Active)</span>
            </button>
            <button
              onClick={() => setActiveTab('upi')}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'upi'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>UPI Pay-Per-Movie &amp; Orders</span>
            </button>
            <button
              onClick={() => setActiveTab('telegram')}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'telegram'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Send className="w-3.5 h-3.5" />
              <span>Telegram Delivery</span>
            </button>
            <button
              onClick={() => setActiveTab('gmail')}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'gmail'
                  ? 'bg-red-600 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Mail className="w-3.5 h-3.5" />
              <span>Gmail Verification (FamPay)</span>
            </button>
          </div>

          {activeTab === 'movies' && (
            <button
              onClick={handleOpenAdd}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-violet-700 hover:from-purple-500 hover:to-violet-600 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-md shadow-purple-950 cursor-pointer self-start sm:self-auto"
            >
              <Plus className="w-4 h-4" />
              <span>Add Movie</span>
            </button>
          )}
        </div>

        {/* SECTION 1: MOVIE MANAGEMENT */}
        {activeTab === 'movies' && (
          <div className="space-y-4">
            
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between text-xs text-zinc-400 gap-2">
              <p>
                Configure pay-per-movie titles. Each movie displays its own individual price on storefront and payment QR.
              </p>
              <span className="font-mono text-purple-300 shrink-0">
                {activeEnabledCount} of {movies.length} published
              </span>
            </div>

            <div className="space-y-3">
              {movies.map((movie) => {
                const isFeatured = !!movie.isFeatured;
                const isEnabled = movie.isEnabled !== false;

                return (
                  <div
                    key={movie.id}
                    className={`rounded-2xl p-4 sm:p-5 border transition-all ${
                      isFeatured
                        ? 'bg-purple-950/25 border-purple-600/70 shadow-lg shadow-purple-950/40'
                        : isEnabled
                        ? 'bg-[#0e0a19] border-purple-950/60 hover:border-purple-800/60'
                        : 'bg-[#090710] border-zinc-900 opacity-60'
                    }`}
                  >
                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                      
                      <div className="flex items-center gap-4 min-w-0 flex-1">
                        <div className="w-16 h-20 sm:w-20 sm:h-24 rounded-xl overflow-hidden bg-black shrink-0 border border-purple-900/40">
                          <MoviePosterArt movie={movie} variant="compact" className="w-full h-full object-cover" />
                        </div>

                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-bold text-white text-base sm:text-lg font-['Outfit'] truncate">
                              {movie.title}
                            </h3>

                            {isFeatured && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-purple-600 text-white flex items-center gap-1 shadow-sm">
                                <Star className="w-3 h-3 fill-white" />
                                <span>Hero</span>
                              </span>
                            )}

                            {isEnabled ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800/40">
                                Published
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[10px] font-mono text-zinc-500 bg-zinc-900 border border-zinc-800">
                                Draft
                              </span>
                            )}
                          </div>

                          <div className="text-xs text-zinc-400 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-medium">
                            <span className="text-purple-300 font-bold tabular-nums">{movie.priceSample}</span>
                            <span>·</span>
                            <span>{movie.year}</span>
                            <span>·</span>
                            <span>{movie.genres.join(', ')}</span>
                            <span>·</span>
                            <span className="font-mono text-zinc-500">{movie.resolution}</span>
                          </div>

                          <p className="text-xs text-zinc-400 line-clamp-1 max-w-xl">
                            {movie.synopsis}
                          </p>

                          <div className="text-[11px] text-zinc-500 pt-0.5">
                            Telegram VIP: <span className="text-purple-300 font-mono">{movie.telegramChannelId || 'None'}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 self-end md:self-auto shrink-0 w-full md:w-auto justify-end border-t md:border-t-0 pt-3 md:pt-0 border-purple-950/40">
                        
                        <button
                          onClick={() => handleOpenPreview(movie)}
                          className="px-2.5 py-1.5 rounded-lg bg-[#140f24] hover:bg-purple-950/60 text-purple-200 border border-purple-900/40 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                          title="Preview on mobile 390px viewport"
                        >
                          <Smartphone className="w-3.5 h-3.5 text-purple-400" />
                          <span className="hidden sm:inline">Mobile Preview</span>
                        </button>

                        <button
                          onClick={() => onToggleEnabled(movie.id)}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer border ${
                            isEnabled
                              ? 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border-zinc-800'
                              : 'bg-emerald-950/50 hover:bg-emerald-900/50 text-emerald-300 border-emerald-800/40'
                          }`}
                          title={isEnabled ? 'Hide from storefront' : 'Publish to storefront'}
                        >
                          {isEnabled ? 'Hide' : 'Publish'}
                        </button>

                        {!isFeatured && isEnabled && (
                          <button
                            onClick={() => {
                              onSetFeatured(movie.id);
                              setNotification(`"${movie.title}" is now the Primary Featured Hero!`);
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-purple-950/80 hover:bg-purple-900 text-purple-200 border border-purple-800/60 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                            title="Set as Hero"
                          >
                            <Star className="w-3.5 h-3.5 text-purple-400" />
                            <span>Set Hero</span>
                          </button>
                        )}

                        <button
                          onClick={() => handleOpenEdit(movie)}
                          className="p-2 text-zinc-400 hover:text-purple-300 hover:bg-purple-950/50 rounded-lg transition-colors cursor-pointer"
                          title="Edit movie"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => handleOpenDelete(movie)}
                          className="p-2 text-zinc-400 hover:text-rose-400 hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
                          title="Delete movie"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>

                      </div>

                    </div>
                  </div>
                );
              })}
            </div>

          </div>
        )}

        {/* SECTION 2: STOREFRONT SETTINGS */}
        {activeTab === 'storefront' && (
          <div className="space-y-6">
            
            {/* Storefront Overview Card */}
            <div className="p-5 sm:p-6 rounded-2xl bg-[#0e0a19] border border-purple-950/60 shadow-lg space-y-4">
              <h3 className="font-bold text-white text-base font-['Outfit']">
                Storefront Overview
              </h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-[#140f24] border border-purple-950/50">
                  <span className="text-zinc-500 text-xs uppercase font-mono block">Published Titles</span>
                  <span className="text-2xl font-extrabold text-white font-['Outfit'] mt-1 block">
                    {activeEnabledCount} Active
                  </span>
                  <span className="text-[11px] text-purple-400 mt-1 block">
                    Live on the storefront
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-[#140f24] border border-purple-950/50">
                  <span className="text-zinc-500 text-xs uppercase font-mono block">Primary Hero Movie</span>
                  <span className="text-base font-bold text-white font-['Outfit'] mt-1 truncate block">
                    {currentFeaturedMovie?.title || 'None'}
                  </span>
                  <span className="text-[11px] text-zinc-400 mt-1 block">
                    {currentFeaturedMovie?.priceSample} · Top Spotlight
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-[#140f24] border border-purple-950/50">
                  <span className="text-zinc-500 text-xs uppercase font-mono block">Business Model</span>
                  <span className="text-xs font-semibold text-emerald-400 mt-1 block">
                    Pay-Per-Movie Only (UPI)
                  </span>
                  <span className="text-[11px] text-zinc-400 mt-1 block">
                    Zero Subscriptions
                  </span>
                </div>
              </div>
            </div>

            {/* Choose Hero Movie Section */}
            <div className="p-5 sm:p-6 rounded-2xl bg-[#0e0a19] border border-purple-950/60 shadow-lg space-y-4">
              <div>
                <h3 className="font-bold text-white text-base font-['Outfit']">
                  Choose Primary Hero Movie
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  The hero receives dominant visual presence at the top of the mobile storefront with the immediate &ldquo;Buy Now&rdquo; CTA.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {movies.filter((m) => m.isEnabled !== false).map((movie) => {
                  const isFeatured = !!movie.isFeatured;

                  return (
                    <button
                      key={movie.id}
                      onClick={() => {
                        onSetFeatured(movie.id);
                        setNotification(`"${movie.title}" selected as Primary Hero.`);
                      }}
                      className={`p-3.5 rounded-xl border text-left flex items-center justify-between gap-3 transition-all cursor-pointer ${
                        isFeatured
                          ? 'bg-purple-950/40 border-purple-600 shadow-md shadow-purple-950'
                          : 'bg-[#140f22] border-purple-950/60 hover:border-purple-800'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-white text-sm truncate">{movie.title}</div>
                        <div className="text-xs text-zinc-400 font-mono mt-0.5">
                          {movie.year} · {movie.priceSample}
                        </div>
                      </div>

                      <div className="shrink-0">
                        {isFeatured ? (
                          <div className="w-6 h-6 rounded-full bg-purple-600 text-white flex items-center justify-center">
                            <Star className="w-3.5 h-3.5 fill-white" />
                          </div>
                        ) : (
                          <div className="w-6 h-6 rounded-full border border-zinc-700 hover:border-purple-500" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

          </div>
        )}

        {/* SECTION 3: UPI CONFIGURATION & ORDERS */}
        {activeTab === 'upi' && (
          <div className="space-y-6">
            
            <div className="p-5 sm:p-6 rounded-2xl bg-[#0e0a19] border border-purple-950/60 shadow-lg space-y-5">
              <div className="flex items-center justify-between border-b border-purple-950/50 pb-3">
                <div className="flex items-center gap-2">
                  <QrCode className="w-4 h-4 text-purple-400" />
                  <h3 className="font-bold text-white text-base font-['Outfit']">
                    UPI Payment Gateway Configuration
                  </h3>
                </div>
                <span className="px-2.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider bg-emerald-950/80 border border-emerald-800/40 text-emerald-300 font-semibold">
                  UPI ONLY
                </span>
              </div>

              <form onSubmit={handleSaveUpiConfig} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-1">
                      UPI ID / VPA (Payee Address) *
                    </label>
                    <input
                      type="text"
                      value={upiVpaDraft}
                      onChange={(e) => setUpiVpaDraft(e.target.value)}
                      placeholder="e.g. flixvault@upi or business@okhdfcbank"
                      className="w-full px-3.5 py-2.5 bg-[#140f24] border border-purple-950/70 focus:border-purple-500 rounded-xl text-xs sm:text-sm text-white font-mono placeholder-zinc-500 focus:outline-none"
                    />
                    <span className="text-[10px] text-zinc-500 mt-1 block">
                      All movie payment QRs encode this UPI VPA.
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-1">
                      Payee Display Name
                    </label>
                    <input
                      type="text"
                      value={upiPayeeDraft}
                      onChange={(e) => setUpiPayeeDraft(e.target.value)}
                      placeholder="FlixVault Cinema"
                      className="w-full px-3.5 py-2.5 bg-[#140f24] border border-purple-950/70 focus:border-purple-500 rounded-xl text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none"
                    />
                    <span className="text-[10px] text-zinc-500 mt-1 block">
                      Shown to buyers in Google Pay, PhonePe, and Paytm.
                    </span>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-purple-950/20 border border-purple-900/40 text-[11px] text-zinc-400 space-y-1">
                  <div className="font-semibold text-purple-300">
                    Unique Paise Reservation Mechanism
                  </div>
                  <p>
                    Every order calculates a unique payable amount with an intentional paise adjustment (e.g. ₹149.38 vs base ₹149.00). This enables deterministic transaction matching with FamPay / Gmail email receipts in Phase 3.
                  </p>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition-colors cursor-pointer"
                  >
                    Save UPI Settings
                  </button>
                </div>
              </form>
            </div>

            {/* UPI Orders Table */}
            <div className="p-5 sm:p-6 rounded-2xl bg-[#0e0a19] border border-purple-950/60 shadow-lg space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-white text-base font-['Outfit']">
                      Pay-Per-Movie UPI Orders ({upiOrders.length})
                    </h3>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-purple-950/80 border border-purple-800/50 text-purple-300 font-semibold">
                      Phase 3B Verified
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Orders automatically matched against FamApp payment alert emails via Gmail IMAP.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleVerifyPayments}
                    disabled={verifyingPayments}
                    className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:bg-purple-950 disabled:text-zinc-500 text-white text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer shadow-md shadow-purple-950/40"
                    title="Scan Gmail IMAP for FamApp Payment Alerts"
                  >
                    <Zap className={`w-3.5 h-3.5 ${verifyingPayments ? 'animate-spin text-purple-200' : 'text-purple-300'}`} />
                    <span>{verifyingPayments ? 'Scanning IMAP...' : 'Verify Payments Now'}</span>
                  </button>

                  <button
                    onClick={loadUpiData}
                    disabled={loadingOrders}
                    className="p-2 rounded-xl text-zinc-400 hover:text-white bg-[#140f24] border border-purple-950/70 transition-colors cursor-pointer"
                    title="Refresh Orders"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingOrders ? 'animate-spin text-purple-400' : ''}`} />
                  </button>
                </div>
              </div>

              {verificationSummary && (
                <div className="p-3.5 rounded-xl bg-purple-950/30 border border-purple-800/40 text-xs space-y-1">
                  <div className="flex items-center justify-between text-purple-300 font-semibold">
                    <span className="flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      Latest IMAP Verification Scan ({verificationSummary.durationMs}ms)
                    </span>
                    <span className="text-[11px] font-mono text-zinc-400">
                      {verificationSummary.scannedEmailsCount} email(s) inspected
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-zinc-300">
                    <span className="px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-800/40 text-emerald-300 font-semibold">
                      {verificationSummary.ordersVerifiedCount} Verified
                    </span>
                    <span className="px-2 py-0.5 rounded bg-amber-950/80 border border-amber-800/40 text-amber-300 font-semibold">
                      {verificationSummary.ordersNeedsReviewCount} Needs Review
                    </span>
                    {verificationSummary.duplicatesRejectedCount > 0 && (
                      <span className="px-2 py-0.5 rounded bg-red-950/80 border border-red-800/40 text-red-300 font-semibold">
                        {verificationSummary.duplicatesRejectedCount} Duplicates Blocked
                      </span>
                    )}
                  </div>
                </div>
              )}

              {upiOrders.length === 0 ? (
                <div className="p-8 text-center text-xs text-zinc-500 rounded-xl bg-[#120d20] border border-purple-950/40">
                  No orders generated yet. When users tap &ldquo;Get This Movie&rdquo;, orders will be recorded here.
                </div>
              ) : (
                <div className="divide-y divide-purple-950/40 border border-purple-950/50 rounded-xl overflow-hidden bg-[#120d20]">
                  {upiOrders.map((order) => {
                    const isVerified = order.status === 'verified';
                    const isNeedsReview = order.status === 'needs_review';
                    const isExpired = order.status === 'expired';
                    const isPending = order.status === 'pending';

                    return (
                      <div
                        key={order.orderId}
                        className="p-3.5 sm:p-4 flex flex-col gap-2.5 text-xs transition-colors hover:bg-purple-950/10"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="space-y-0.5">
                            <div className="font-semibold text-white flex items-center gap-2">
                              <span>{order.movieTitle}</span>
                              <span className="font-mono text-purple-300 font-bold">
                                ₹{order.payableAmount.toFixed(2)}
                              </span>
                            </div>
                            <div className="text-[11px] text-zinc-400 font-mono flex flex-wrap items-center gap-x-2">
                              <span>Order: <strong className="text-zinc-200">{order.orderId}</strong></span>
                              <span>·</span>
                              <span>Base: ₹{order.originalPrice}</span>
                              <span>·</span>
                              <span>Created: {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                              <span>·</span>
                              <span>Expires: {new Date(order.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 self-start sm:self-auto">
                            {isVerified && (
                              <span className="px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold tracking-wide uppercase bg-emerald-950/90 border border-emerald-700/60 text-emerald-300 flex items-center gap-1.5 shadow-sm shadow-emerald-950">
                                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                Verified
                              </span>
                            )}
                            {isNeedsReview && (
                              <span className="px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold tracking-wide uppercase bg-amber-950/90 border border-amber-700/60 text-amber-300 flex items-center gap-1.5 shadow-sm shadow-amber-950">
                                <AlertTriangle className="w-3 h-3 text-amber-400" />
                                Needs Review
                              </span>
                            )}
                            {isExpired && (
                              <span className="px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold tracking-wide uppercase bg-zinc-900 border border-zinc-700/60 text-zinc-400 flex items-center gap-1.5">
                                <Clock className="w-3 h-3 text-zinc-500" />
                                Expired
                              </span>
                            )}
                            {isPending && (
                              <span className="px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold tracking-wide uppercase bg-blue-950/80 border border-blue-800/50 text-blue-300 flex items-center gap-1.5">
                                <Clock className="w-3 h-3 text-blue-400" />
                                Pending
                              </span>
                            )}
                          </div>
                        </div>

                        {isVerified && (
                          <div className="p-2.5 rounded-lg bg-emerald-950/20 border border-emerald-900/30 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-emerald-300/90 font-mono">
                            <span>Matched Amount: <strong>₹{(order.matchedAmountRupees || order.payableAmount).toFixed(2)}</strong> ({order.matchedAmountPaise || Math.round(order.payableAmount * 100)} paise)</span>
                            <span>Masked UTR: <strong>{order.maskedUtr || (order.matchedUtr ? `${order.matchedUtr.slice(0, 4)}****${order.matchedUtr.slice(-4)}` : '—')}</strong></span>
                            {order.fampayTxnId && <span>FamApp Txn: <strong>{order.fampayTxnId}</strong></span>}
                            <span>Verified At: {order.verifiedAt ? new Date(order.verifiedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Confirmed'}</span>
                          </div>
                        )}

                        {isNeedsReview && order.verificationReason && (
                          <div className="p-2.5 rounded-lg bg-amber-950/30 border border-amber-900/50 text-[11px] text-amber-200/90 flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                            <div className="space-y-0.5">
                              <span className="font-semibold text-amber-300">Reason: </span>
                              <span>{order.verificationReason}</span>
                              {order.maskedUtr && <span className="block font-mono text-[10px] text-amber-400/80">UTR: {order.maskedUtr}</span>}
                            </div>
                          </div>
                        )}

                        {isExpired && order.verificationReason && (
                          <div className="p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800 text-[11px] text-zinc-400 flex items-center gap-2">
                            <Clock className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                            <span>{order.verificationReason}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        )}

        {/* SECTION 4: TELEGRAM DELIVERY */}
        {activeTab === 'telegram' && (
          <TelegramConfigSection
            movies={movies}
            config={telegramConfig}
            onUpdateConfig={onUpdateTelegramConfig}
            onUpdateMovieChannel={(movieId, channelId) => {
              const movie = movies.find((m) => m.id === movieId);
              if (movie) {
                onUpdateMovie({
                  ...movie,
                  telegramChannelId: channelId,
                });
              }
            }}
          />
        )}

        {/* SECTION 5: GMAIL IMAP VERIFICATION */}
        {activeTab === 'gmail' && (
          <GmailVerificationSection />
        )}

      </main>

      <MovieEditModal
        isOpen={editModalOpen}
        movie={editingMovie}
        onSave={handleSaveMovie}
        onClose={() => {
          setEditModalOpen(false);
          setEditingMovie(null);
        }}
      />

      <DeleteConfirmModal
        movie={movieToDelete}
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          setDeleteModalOpen(false);
          setMovieToDelete(null);
        }}
      />

      <MobilePreviewModal
        movie={previewMovie}
        onClose={() => {
          setPreviewModalOpen(false);
          setPreviewMovie(null);
        }}
      />

    </div>
  );
};
