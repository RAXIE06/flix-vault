import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Movie, TelegramConfig, InfoModalContent } from './types';
import { INITIAL_TELEGRAM_CONFIG, resolveFeaturedMovie, resolveSecondaryMovies } from './data/movies';
import { api } from './services/api';
import { Header } from './components/Header';
import { FeaturedHero } from './components/FeaturedHero';
import { SecondaryShowcase } from './components/SecondaryShowcase';
import { MovieDetailsModal } from './components/MovieDetailsModal';
import { PurchaseModal } from './components/PurchaseModal';
import { AdminAccessModal } from './components/AdminAccessModal';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { InfoModal } from './components/InfoModal';
import { Footer } from './components/Footer';
import { Loader2, AlertCircle, RefreshCw, Database } from 'lucide-react';

export default function App() {
  // Server-managed Movies State
  const [movies, setMovies] = useState<Movie[]>([]);
  const [adminMovies, setAdminMovies] = useState<Movie[]>([]);
  const [telegramConfig, setTelegramConfig] = useState<TelegramConfig>(INITIAL_TELEGRAM_CONFIG);
  const [storageSource, setStorageSource] = useState<string>('connecting');
  const [dbStatus, setDbStatus] = useState<any>(null);

  // Loading & Error States
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Admin View & Authentication States
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);

  // Modals & Navigation States
  const [detailsMovie, setDetailsMovie] = useState<Movie | null>(null);
  const [purchaseMovie, setPurchaseMovie] = useState<Movie | null>(null);
  const [infoModalContent, setInfoModalContent] = useState<InfoModalContent | null>(null);

  // Fetch Public Storefront Data from Backend
  const loadPublicStorefront = useCallback(async () => {
    try {
      setLoadError(null);
      const [moviesRes, healthRes] = await Promise.all([
        api.getPublicMovies(),
        api.checkHealth(),
      ]);

      setMovies(moviesRes.movies);
      setStorageSource(moviesRes.storage);
      setDbStatus(healthRes.database);
    } catch (err: any) {
      console.error('Failed to load public storefront from server:', err);
      setLoadError(err.message || 'Could not load movies from server.');
    } finally {
      setInitialLoading(false);
    }
  }, []);

  // Fetch Admin Movies (including disabled drafts)
  const loadAdminData = useCallback(async () => {
    try {
      const [adminMoviesRes, settingsRes] = await Promise.all([
        api.getAdminMovies(),
        api.getAdminSettings(),
      ]);

      setAdminMovies(adminMoviesRes.movies);
      if (settingsRes.settings?.telegramConfig) {
        setTelegramConfig(settingsRes.settings.telegramConfig);
      }
      setDbStatus(settingsRes.database);
    } catch (err) {
      console.error('Failed to load admin data:', err);
    }
  }, []);

  // Initial startup verification
  useEffect(() => {
    loadPublicStorefront();

    // Check existing server session
    api.checkAdminSession().then((authenticated) => {
      setIsAdminAuthenticated(authenticated);
    });
  }, [loadPublicStorefront]);

  // When admin panel opens, load full admin dataset
  useEffect(() => {
    if (adminPanelOpen) {
      loadAdminData();
    }
  }, [adminPanelOpen, loadAdminData]);

  // Primary Featured Movie calculation from server data
  const primaryFeaturedMovie = useMemo(() => {
    return resolveFeaturedMovie(movies);
  }, [movies]);

  // Secondary Showcase Movies from server data
  const secondaryMovies = useMemo(() => {
    return resolveSecondaryMovies(movies, primaryFeaturedMovie?.id);
  }, [movies, primaryFeaturedMovie]);

  // Smooth Navigation Handler
  const handleNavigate = useCallback((sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  // =========================================================================
  // BACKEND-CONNECTED ADMIN CRUD HANDLERS
  // =========================================================================

  const handleAddMovie = async (newMovie: Movie) => {
    // Await server confirmation before claiming success
    await api.createMovie(newMovie);
    await Promise.all([loadAdminData(), loadPublicStorefront()]);
  };

  const handleUpdateMovie = async (updatedMovie: Movie) => {
    await api.updateMovie(updatedMovie.id, updatedMovie);
    await Promise.all([loadAdminData(), loadPublicStorefront()]);
  };

  const handleDeleteMovie = async (movieId: string) => {
    await api.deleteMovie(movieId);
    await Promise.all([loadAdminData(), loadPublicStorefront()]);
  };

  const handleSetFeatured = async (movieId: string) => {
    await api.setFeaturedMovie(movieId);
    await Promise.all([loadAdminData(), loadPublicStorefront()]);
  };

  const handleToggleEnabled = async (movieId: string) => {
    await api.toggleMovieStatus(movieId);
    await Promise.all([loadAdminData(), loadPublicStorefront()]);
  };

  const handleUpdateTelegramConfig = async (updated: Partial<TelegramConfig>) => {
    const newConfig = { ...telegramConfig, ...updated };
    setTelegramConfig(newConfig);
    await api.updateAdminSettings({ telegramConfig: newConfig });
  };

  const handleAdminAuthenticated = () => {
    setIsAdminAuthenticated(true);
    setAdminModalOpen(false);
    setAdminPanelOpen(true);
  };

  const handleOpenAdminAccess = () => {
    // Restore prompt for secret-code modal upon clicking Admin
    setAdminModalOpen(true);
  };

  const handleAdminLogout = async () => {
    try {
      await api.logoutAdmin();
    } catch {
      // Ignore
    }
    setIsAdminAuthenticated(false);
    setAdminPanelOpen(false);
  };

  // If Admin Dashboard is active, render full administrative workspace
  if (adminPanelOpen) {
    return (
      <AdminDashboard
        movies={adminMovies.length > 0 ? adminMovies : movies}
        onAddMovie={handleAddMovie}
        onUpdateMovie={handleUpdateMovie}
        onDeleteMovie={handleDeleteMovie}
        onSetFeatured={handleSetFeatured}
        onToggleEnabled={handleToggleEnabled}
        telegramConfig={telegramConfig}
        onUpdateTelegramConfig={handleUpdateTelegramConfig}
        onExit={() => setAdminPanelOpen(false)}
        onLogout={handleAdminLogout}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#08070d] text-zinc-100 flex flex-col selection:bg-purple-600 selection:text-white">
      
      {/* 1. PREMIUM COMPACT HEADER */}
      <Header
        hasSecondaryMovies={secondaryMovies.length > 0}
        onNavigate={handleNavigate}
        onOpenAdminAccess={handleOpenAdminAccess}
      />

      {/* Database Connection Indicator Banner in Development */}
      {dbStatus && (
        <div className="bg-[#0b0816] border-b border-purple-950/40 px-4 py-1 text-[11px] text-zinc-400 flex items-center justify-between max-w-5xl mx-auto w-full">
          <div className="flex items-center gap-1.5">
            <Database className="w-3 h-3 text-purple-400" />
            <span>Persistence: </span>
            <span className={`font-mono font-medium ${dbStatus.connected ? 'text-emerald-400' : 'text-amber-400'}`}>
              {dbStatus.connected ? 'MongoDB Atlas (Connected)' : 'Server In-Memory Repository (Fallback)'}
            </span>
          </div>
          <span className="text-[10px] text-zinc-500 font-mono hidden sm:inline">
            Node.js/Express API Active
          </span>
        </div>
      )}

      {/* Main Content Area with Loading & Error States */}
      <main className="flex-1 flex flex-col">
        {initialLoading ? (
          <div className="py-32 flex flex-col items-center justify-center space-y-3">
            <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
            <p className="text-xs text-zinc-400 font-mono">
              Loading verified titles from FlixVault backend...
            </p>
          </div>
        ) : loadError ? (
          <div className="max-w-md mx-auto my-16 p-6 rounded-2xl bg-[#120a1c] border border-rose-900/60 text-center space-y-3">
            <AlertCircle className="w-8 h-8 text-rose-400 mx-auto" />
            <h3 className="font-bold text-white text-base font-['Outfit']">
              Failed to Connect to Server
            </h3>
            <p className="text-xs text-zinc-400 leading-relaxed">{loadError}</p>
            <button
              onClick={() => {
                setInitialLoading(true);
                loadPublicStorefront();
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Connection</span>
            </button>
          </div>
        ) : (
          <>
            {/* 2. FEATURED MOVIE — PRIMARY HIGH-ATTENTION HERO */}
            {primaryFeaturedMovie ? (
              <FeaturedHero
                movie={primaryFeaturedMovie}
                onBuyNow={(movie) => setPurchaseMovie(movie)}
                onViewDetails={(movie) => setDetailsMovie(movie)}
              />
            ) : (
              <div className="py-20 text-center text-zinc-400">
                <p>No active featured movie currently published.</p>
              </div>
            )}

            {/* 3. SECONDARY SHOWCASE (Only if 2–5 movies exist) */}
            {secondaryMovies.length > 0 && (
              <SecondaryShowcase
                movies={secondaryMovies}
                onBuyNow={(movie) => setPurchaseMovie(movie)}
                onViewDetails={(movie) => setDetailsMovie(movie)}
              />
            )}
          </>
        )}
      </main>

      {/* 5. MINIMAL FOOTER with discreet Admin access */}
      <Footer
        onOpenInfo={setInfoModalContent}
        onOpenAdminAccess={handleOpenAdminAccess}
      />

      {/* INSTANT PURCHASE / GET THIS MOVIE MODAL */}
      <PurchaseModal
        movie={purchaseMovie}
        onClose={() => setPurchaseMovie(null)}
      />

      {/* FULL MOVIE SPECIFICATIONS & DETAILS MODAL */}
      <MovieDetailsModal
        movie={detailsMovie}
        onClose={() => setDetailsMovie(null)}
        onBuyNow={(movie) => {
          setDetailsMovie(null);
          setPurchaseMovie(movie);
        }}
      />

      {/* ADMIN ACCESS MODAL (Secret Code Entry verified on server) */}
      <AdminAccessModal
        isOpen={adminModalOpen}
        onClose={() => setAdminModalOpen(false)}
        onAuthenticated={handleAdminAuthenticated}
      />

      {/* INFORMATIONAL & LEGAL POLICIES MODAL */}
      <InfoModal
        content={infoModalContent}
        onClose={() => setInfoModalContent(null)}
      />

    </div>
  );
}
