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
  BarChart3,
  Megaphone,
  Save,
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
import { AdminAnalyticsTab } from './AdminAnalyticsTab';
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
  currentAnnouncement?: string;
  onAnnouncementSaved?: (text: string, enabled: boolean) => void;
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
  currentAnnouncement,
  onAnnouncementSaved,
  onExit,
  onLogout,
}) => {
  const [activeTab, setActiveTab] = useState<
    'analytics' | 'movies' | 'storefront' | 'upi' | 'telegram' | 'gmail'
  >('movies');

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

  // ============================================================
  // ANNOUNCEMENT STATE (NEW)
  // ============================================================
  const [announcementDraft, setAnnouncementDraft] = useState(currentAnnouncement || '');
  const [announcementEnabledDraft, setAnnouncementEnabledDraft] = useState(true);
  const [announcementSaving, setAnnouncementSaving] = useState(false);

  const activeEnabledCount = movies.filter((m) => m.isEnabled !== false).length;
  const currentFeaturedMovie =
    movies.find((m) => m.isFeatured && m.isEnabled !== false) ||
    movies.find((m) => m.isEnabled !== false);

  const [dbStatus, setDbStatus] = useState<any>(null);
  const [retryingDb, setRetryingDb] = useState(false);

  useEffect(() => {
    loadDbStatus();
  }, []);

  // Load announcement from server (fresh)
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/settings/announcement');
        if (!res.ok) return;
        const data = await res.json();
        setAnnouncementDraft(data.text || '');
        setAnnouncementEnabledDraft(data.enabled !== false);
      } catch {
        // Ignore
      }
    })();
  }, []);

  const handleSaveAnnouncement = async () => {
    setAnnouncementSaving(true);
    try {
      const res = await fetch('/api/admin/settings/announcement', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          text: announcementDraft,
          enabled: announcementEnabledDraft,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');

      setNotification('✅ Announcement updated! Website pe refresh karke dekho.');
      if (onAnnouncementSaved) {
        onAnnouncementSaved(announcementDraft, announcementEnabledDraft);
      }
    } catch (err: any) {
      setNotification(`❌ Failed to save announcement: ${err.message}`);
    } finally {
      setAnnouncementSaving(false);
    }
  };

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
  const [verificationSummary, setVerificationSummary] =
    useState<PaymentVerificationScanResponse | null>(null);

  const handleVerifyPayments = async () => {
    setVerifyingPayments(true);
    try {
      const res = await api.verifyPayments(25);
      setVerificationSummary(res);
      await loadUpiData();
      if (res.ordersVerifiedCount > 0) {
        setNotification(`✅ Verified ${res.ordersVerifiedCount} payment(s) automatically.`);
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
      setNotification(`Updated "${savedMovie.title}". Changes are live!`);
    } else {
      onAddMovie(savedMovie);
      setNotification(`Published "${savedMovie.title}" to the catalog!`);
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
                Resilient Fallback Mode
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
          <span>Unique payable amount per order. Subscriptions removed.</span>
        </div>
      </div>

      {/* Main Workspace */}
      <main className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full text-left space-y-6">
        
        {notification && (
          <div className="p-3.5 rounded-xl bg-purple-950/50 border border-purple-700/60 text-xs text-purple-200 flex items-center justify-between gap-3">
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

        {/* Navigation Tabs */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between border-b border-purple-950/60 pb-4 gap-3">
          <div className="flex items-center gap-1.5 bg-[#120d20] p-1 rounded-xl border border-purple-950/50 overflow-x-auto">
            <button
              onClick={() => setActiveTab('analytics')}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'analytics' ? 'bg-purple-600 text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Analytics</span>
            </button>
            <button
              onClick={() => setActiveTab('movies')}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'movies' ? 'bg-purple-600 text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Film className="w-3.5 h-3.5" />
              <span>Movie Management ({movies.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('storefront')}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'storefront' ? 'bg-purple-600 text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Storefront ({activeEnabledCount} Active)</span>
            </button>
            <button
              onClick={() => setActiveTab('upi')}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'upi' ? 'bg-purple-600 text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>UPI &amp; Orders</span>
            </button>
            <button
              onClick={() => setActiveTab('telegram')}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'telegram' ? 'bg-purple-600 text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Send className="w-3.5 h-3.5" />
              <span>Telegram Delivery</span>
            </button>
            <button
              onClick={() => setActiveTab('gmail')}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'gmail' ? 'bg-red-600 text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Mail className="w-3.5 h-3.5" />
              <span>Gmail Verification</span>
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

        {/* SECTION 0: ANALYTICS */}
        {activeTab === 'analytics' && <AdminAnalyticsTab />}

        {/* SECTION 1: MOVIE MANAGEMENT */}
        {activeTab === 'movies' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between text-xs text-zinc-400 gap-2">
              <p>Configure pay-per-movie titles with individual pricing.</p>
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
                        ? 'bg-purple-950/25 border-purple-600/70'
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
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-purple-600 text-white flex items-center gap-1">
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

                          <p className="text-xs text-zinc-400 line-clamp-1 max-w-xl">{movie.synopsis}</p>

                          {movie.languages && movie.languages.length > 0 && (
                            <div className="text-[11px] text-emerald-300/90 font-mono pt-0.5">
                              Languages: {movie.languages.join(', ')}
                            </div>
                          )}

                          <div className="text-[11px] text-zinc-500 pt-0.5">
                            Telegram VIP: <span className="text-purple-300 font-mono">{movie.telegramChannelId || 'None'}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 self-end md:self-auto shrink-0 w-full md:w-auto justify-end border-t md:border-t-0 pt-3 md:pt-0 border-purple-950/40">
                        <button
                          onClick={() => handleOpenPreview(movie)}
                          className="px-2.5 py-1.5 rounded-lg bg-[#140f24] hover:bg-purple-950/60 text-purple-200 border border-purple-900/40 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                        >
                          <Smartphone className="w-3.5 h-3.5 text-purple-400" />
                          <span className="hidden sm:inline">Preview</span>
                        </button>

                        <button
                          onClick={() => onToggleEnabled(movie.id)}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer border ${
                            isEnabled
                              ? 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border-zinc-800'
                              : 'bg-emerald-950/50 hover:bg-emerald-900/50 text-emerald-300 border-emerald-800/40'
                          }`}
                        >
                          {isEnabled ? 'Hide' : 'Publish'}
                        </button>

                        {!isFeatured && isEnabled && (
                          <button
                            onClick={() => {
                              onSetFeatured(movie.id);
                              setNotification(`"${movie.title}" is now the Primary Featured Hero!`);
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-purple-950/80 hover:bg-purple-900 text-purple-200 border border-purple-800/60 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                          >
                            <Star className="w-3.5 h-3.5 text-purple-400" />
                            <span>Set Hero</span>
                          </button>
                        )}

                        <button
                          onClick={() => handleOpenEdit(movie)}
                          className="p-2 text-zinc-400 hover:text-purple-300 hover:bg-purple-950/50 rounded-lg cursor-pointer"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => handleOpenDelete(movie)}
                          className="p-2 text-zinc-400 hover:text-rose-400 hover:bg-rose-950/40 rounded-lg cursor-pointer"
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

        {/* SECTION 2: STOREFRONT SETTINGS (with Announcement Editor) */}
        {activeTab === 'storefront' && (
          <div className="space-y-6">
            
            {/* ANNOUNCEMENT EDITOR — NEW */}
            <div className="p-5 sm:p-6 rounded-2xl bg-[#0e0a19] border border-purple-950/60 shadow-lg space-y-4">
              <div className="flex items-center gap-2 border-b border-purple-950/50 pb-3">
                <Megaphone className="w-4 h-4 text-purple-400" />
                <h3 className="font-bold text-white text-base font-['Outfit']">
                  Announcement Bar
                </h3>
                <span className="ml-auto text-[10px] text-zinc-500 font-mono">
                  Top marquee text
                </span>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1">
                    Marquee Message (max 250 characters)
                  </label>
                  <textarea
                    value={announcementDraft}
                    onChange={(e) => setAnnouncementDraft(e.target.value.slice(0, 250))}
                    rows={2}
                    placeholder="📢 Buy any movie for just ₹19! Instant Telegram delivery."
                    className="w-full px-3.5 py-2.5 bg-[#140f24] border border-purple-950/70 focus:border-purple-500 rounded-xl text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none resize-none"
                  />
                  <span className="text-[10px] text-zinc-500 mt-1 block">
                    {announcementDraft.length}/250 characters
                  </span>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-[#140f24] border border-purple-950/50">
                  <div>
                    <span className="text-xs font-semibold text-white block">Show Announcement Bar</span>
                    <span className="text-[10px] text-zinc-400">Toggle visibility on website</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={announcementEnabledDraft}
                    onChange={(e) => setAnnouncementEnabledDraft(e.target.checked)}
                    className="w-4 h-4 accent-purple-600 rounded cursor-pointer"
                  />
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    onClick={handleSaveAnnouncement}
                    disabled={announcementSaving || !announcementDraft.trim()}
                    className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:bg-purple-950 disabled:text-zinc-500 text-white text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer"
                  >
                    {announcementSaving ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-3.5 h-3.5" />
                        <span>Save Announcement</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Storefront Overview */}
            <div className="p-5 sm:p-6 rounded-2xl bg-[#0e0a19] border border-purple-950/60 shadow-lg space-y-4">
              <h3 className="font-bold text-white text-base font-['Outfit']">Storefront Overview</h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-[#140f24] border border-purple-950/50">
                  <span className="text-zinc-500 text-xs uppercase font-mono block">Published Titles</span>
                  <span className="text-2xl font-extrabold text-white font-['Outfit'] mt-1 block">
                    {activeEnabledCount} Active
                  </span>
                  <span className="text-[11px] text-purple-400 mt-1 block">Live on storefront</span>
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
                  <span className="text-[11px] text-zinc-400 mt-1 block">Zero Subscriptions</span>
                </div>
              </div>
            </div>

            {/* Choose Hero */}
            <div className="p-5 sm:p-6 rounded-2xl bg-[#0e0a19] border border-purple-950/60 shadow-lg space-y-4">
              <div>
                <h3 className="font-bold text-white text-base font-['Outfit']">Choose Primary Hero Movie</h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Hero receives dominant visual presence on mobile storefront.
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
                          ? 'bg-purple-950/40 border-purple-600'
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
                <span className="px-2.5 py-0.5 rounded text-[10px] font-mono uppercase bg-emerald-950/80 border border-emerald-800/40 text-emerald-300 font-semibold">
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
                      placeholder="e.g. business@okhdfcbank"
                      className="w-full px-3.5 py-2.5 bg-[#140f24] border border-purple-950/70 focus:border-purple-500 rounded-xl text-xs sm:text-sm text-white font-mono placeholder-zinc-500 focus:outline-none"
                    />
                    <span className="text-[10px] text-amber-400 mt-1 block">
                      ⚠️ Bank UPI recommended (@okhdfcbank, @ybl, @paytm) — avoid @fam
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
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold cursor-pointer"
                  >
                    Save UPI Settings
                  </button>
                </div>
              </form>
            </div>

            <div className="p-5 sm:p-6 rounded-2xl bg-[#0e0a19] border border-purple-950/60 shadow-lg space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold text-white text-base font-['Outfit']">
                    Pay-Per-Movie UPI Orders ({upiOrders.length})
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Auto-matched via Gmail IMAP.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleVerifyPayments}
                    disabled={verifyingPayments}
                    className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:bg-purple-950 text-white text-xs font-semibold flex items-center gap-2 cursor-pointer"
                  >
                    <Zap className={`w-3.5 h-3.5 ${verifyingPayments ? 'animate-spin' : ''}`} />
                    <span>{verifyingPayments ? 'Scanning...' : 'Verify Payments Now'}</span>
                  </button>
                  <button
                    onClick={loadUpiData}
                    disabled={loadingOrders}
                    className="p-2 rounded-xl text-zinc-400 hover:text-white bg-[#140f24] border border-purple-950/70 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingOrders ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              {verificationSummary && (
                <div className="p-3.5 rounded-xl bg-purple-950/30 border border-purple-800/40 text-xs">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-800/40 text-emerald-300 font-semibold">
                      {verificationSummary.ordersVerifiedCount} Verified
                    </span>
                    <span className="px-2 py-0.5 rounded bg-amber-950/80 border border-amber-800/40 text-amber-300 font-semibold">
                      {verificationSummary.ordersNeedsReviewCount} Needs Review
                    </span>
                    <span className="text-zinc-400 font-mono text-[11px]">
                      {verificationSummary.scannedEmailsCount} emails inspected
                    </span>
                  </div>
                </div>
              )}

              {upiOrders.length === 0 ? (
                <div className="p-8 text-center text-xs text-zinc-500 rounded-xl bg-[#120d20] border border-purple-950/40">
                  No orders yet.
                </div>
              ) : (
                <div className="divide-y divide-purple-950/40 border border-purple-950/50 rounded-xl overflow-hidden bg-[#120d20]">
                  {upiOrders.map((order) => {
                    const isVerified = order.status === 'verified';
                    const isNeedsReview = order.status === 'needs_review';
                    const isExpired = order.status === 'expired';
                    const isPending = order.status === 'pending';

                    return (
                      <div key={order.orderId} className="p-3.5 sm:p-4 flex flex-col gap-2.5 text-xs hover:bg-purple-950/10">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="space-y-0.5">
                            <div className="font-semibold text-white flex items-center gap-2">
                              <span>{order.movieTitle}</span>
                              <span className="font-mono text-purple-300 font-bold">
                                ₹{order.payableAmount.toFixed(2)}
                              </span>
                            </div>
                            <div className="text-[11px] text-zinc-400 font-mono">
                              Order: <strong className="text-zinc-200">{order.orderId}</strong> · {new Date(order.createdAt).toLocaleTimeString()}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 self-start sm:self-auto">
                            {isVerified && (
                              <span className="px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold uppercase bg-emerald-950/90 border border-emerald-700/60 text-emerald-300 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" /> Verified
                              </span>
                            )}
                            {isNeedsReview && (
                              <span className="px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold uppercase bg-amber-950/90 border border-amber-700/60 text-amber-300 flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" /> Review
                              </span>
                            )}
                            {isExpired && (
                              <span className="px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold uppercase bg-zinc-900 border border-zinc-700/60 text-zinc-400 flex items-center gap-1">
                                <Clock className="w-3 h-3" /> Expired
                              </span>
                            )}
                            {isPending && (
                              <span className="px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold uppercase bg-blue-950/80 border border-blue-800/50 text-blue-300 flex items-center gap-1">
                                <Clock className="w-3 h-3" /> Pending
                              </span>
                            )}
                          </div>
                        </div>
                        {isVerified && (
                          <div className="p-2.5 rounded-lg bg-emerald-950/20 border border-emerald-900/30 flex flex-wrap items-center gap-x-4 text-[11px] text-emerald-300/90 font-mono">
                            <span>UTR: <strong>{order.maskedUtr || '—'}</strong></span>
                            {order.fampayTxnId && <span>Txn: <strong>{order.fampayTxnId}</strong></span>}
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

        {/* SECTION 4: TELEGRAM */}
        {activeTab === 'telegram' && (
          <TelegramConfigSection
            movies={movies}
            config={telegramConfig}
            onUpdateConfig={onUpdateTelegramConfig}
            onUpdateMovieChannel={(movieId, channelId) => {
              const movie = movies.find((m) => m.id === movieId);
              if (movie) {
                onUpdateMovie({ ...movie, telegramChannelId: channelId });
              }
            }}
          />
        )}

        {/* SECTION 5: GMAIL */}
        {activeTab === 'gmail' && <GmailVerificationSection />}
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
