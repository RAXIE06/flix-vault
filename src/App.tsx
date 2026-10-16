import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Movie, TelegramConfig, InfoModalContent } from './types';
import {
  INITIAL_TELEGRAM_CONFIG,
  resolveFeaturedMovie,
  resolveSecondaryMovies,
} from './data/movies';
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
import { MyOrdersPage } from './components/MyOrdersPage';
import { SplashScreen } from './components/SplashScreen';

// ✅ Empty fallback — only real MongoDB movies will show
const LOCAL_FALLBACK_MOVIES: Movie[] = [];

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [movies, setMovies] = useState<Movie[]>([]);
  const [adminMovies, setAdminMovies] = useState<Movie[]>([]);
  const [telegramConfig, setTelegramConfig] = useState<TelegramConfig>(INITIAL_TELEGRAM_CONFIG);
  const [announcement, setAnnouncement] = useState<string | undefined>(undefined);
  const [announcementEnabled, setAnnouncementEnabled] = useState(true);
  const [storageSource, setStorageSource] = useState<string>('loading');
  const [dbStatus, setDbStatus] = useState<any>(null);

  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);

  const [detailsMovie, setDetailsMovie] = useState<Movie | null>(null);
  const [purchaseMovie, setPurchaseMovie] = useState<Movie | null>(null);
  const [infoModalContent, setInfoModalContent] = useState<InfoModalContent | null>(null);

  // ============================================================
  // ROUTING — hash-based
  // ============================================================
  const [currentRoute, setCurrentRoute] = useState<string>(() =>
    window.location.hash.replace('#', '') || '/'
  );

  useEffect(() => {
    const handleHashChange = () =>
      setCurrentRoute(window.location.hash.replace('#', '') || '/');
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const navigateTo = useCallback((route: string) => {
    window.location.hash = route;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // ============================================================
  // LOAD STOREFRONT — with retry logic for slow networks
  // ============================================================
  const loadPublicStorefront = useCallback(async () => {
    const fetchWithRetry = async (attempt: number): Promise<any> => {
      try {
        const [moviesRes, healthRes] = await Promise.all([
          api.getPublicMovies(),
          api.checkHealth(),
        ]);
        return { moviesRes, healthRes };
      } catch (err) {
        if (attempt < 3) {
          await new Promise((r) => setTimeout(r, 1500));
          return fetchWithRetry(attempt + 1);
        }
        throw err;
      }
    };

    try {
      const { moviesRes, healthRes } = await fetchWithRetry(1);

      if (moviesRes?.movies) {
        // Only replace if we got a valid array (empty arrays preserve current)
        setMovies((prev) => (moviesRes.movies.length > 0 ? moviesRes.movies : prev));
        setStorageSource(moviesRes.storage || 'mongodb');
      }
      if (healthRes?.database) setDbStatus(healthRes.database);
    } catch (err: any) {
      console.warn('[FlixVault] Server unavailable after retries');
      // Only set fallback if we currently have no movies at all
      setMovies((prev) => (prev.length > 0 ? prev : LOCAL_FALLBACK_MOVIES));
      setStorageSource('offline');
      setDbStatus({ connected: false, fallback: true });
    }
  }, []);

  // ============================================================
  // LOAD ANNOUNCEMENT
  // ============================================================
  const loadAnnouncement = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/announcement');
      if (!res.ok) return;
      const data = await res.json();
      if (data.text) setAnnouncement(data.text);
      setAnnouncementEnabled(data.enabled !== false);
    } catch {
      // Ignore — use default
    }
  }, []);

  const loadAdminData = useCallback(async () => {
    try {
      const [adminMoviesRes, settingsRes] = await Promise.all([
        api.getAdminMovies(),
        api.getAdminSettings(),
      ]);
      if (adminMoviesRes?.movies) setAdminMovies(adminMoviesRes.movies);
      if (settingsRes?.settings?.telegramConfig) {
        setTelegramConfig(settingsRes.settings.telegramConfig);
      }
    } catch (err) {
      console.warn('[FlixVault] Admin data unavailable:', err);
    }
  }, []);

  useEffect(() => {
    loadPublicStorefront();
    loadAnnouncement();
    api.checkAdminSession().then(setIsAdminAuthenticated).catch(() => {});
  }, [loadPublicStorefront, loadAnnouncement]);

  useEffect(() => {
    if (adminPanelOpen) loadAdminData();
  }, [adminPanelOpen, loadAdminData]);

  const primaryFeaturedMovie = useMemo(() => resolveFeaturedMovie(movies), [movies]);
  const secondaryMovies = useMemo(
    () => resolveSecondaryMovies(movies, primaryFeaturedMovie?.id),
    [movies, primaryFeaturedMovie]
  );

  const handleNavigate = useCallback(
    (sectionId: string) => {
      if (currentRoute === '/my-orders') {
        navigateTo('/');
        setTimeout(() => {
          document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth' });
        }, 200);
        return;
      }
      document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth' });
    },
    [currentRoute, navigateTo]
  );

  const handleAddMovie = async (newMovie: Movie) => {
    try {
      await api.createMovie(newMovie);
      await Promise.all([loadAdminData(), loadPublicStorefront()]);
    } catch (err: any) {
      console.error('Add movie failed:', err);
      setAdminMovies((prev) => [newMovie, ...prev]);
    }
  };

  const handleUpdateMovie = async (updatedMovie: Movie) => {
    try {
      await api.updateMovie(updatedMovie.id, updatedMovie);
      await Promise.all([loadAdminData(), loadPublicStorefront()]);
    } catch (err: any) {
      console.error('Update movie failed:', err);
      setAdminMovies((prev) => prev.map((m) => (m.id === updatedMovie.id ? updatedMovie : m)));
    }
  };

  const handleDeleteMovie = async (movieId: string) => {
    try {
      await api.deleteMovie(movieId);
      await Promise.all([loadAdminData(), loadPublicStorefront()]);
    } catch (err: any) {
      console.error('Delete movie failed:', err);
      setAdminMovies((prev) => prev.filter((m) => m.id !== movieId));
    }
  };

  const handleSetFeatured = async (movieId: string) => {
    try {
      await api.setFeaturedMovie(movieId);
      await Promise.all([loadAdminData(), loadPublicStorefront()]);
    } catch (err: any) {
      console.error('Set featured failed:', err);
      setAdminMovies((prev) => prev.map((m) => ({ ...m, isFeatured: m.id === movieId })));
    }
  };

  const handleToggleEnabled = async (movieId: string) => {
    try {
      await api.toggleMovieStatus(movieId);
      await Promise.all([loadAdminData(), loadPublicStorefront()]);
    } catch (err: any) {
      console.error('Toggle failed:', err);
      setAdminMovies((prev) =>
        prev.map((m) => (m.id === movieId ? { ...m, isEnabled: !m.isEnabled } : m))
      );
    }
  };

  const handleUpdateTelegramConfig = async (updated: Partial<TelegramConfig>) => {
    const newConfig = { ...telegramConfig, ...updated };
    setTelegramConfig(newConfig);
    try {
      await api.updateAdminSettings({ telegramConfig: newConfig });
    } catch (err) {
      console.warn('Settings save failed:', err);
    }
  };

  // ✅ When admin saves announcement, update local state instantly
  const handleAnnouncementSaved = (text: string, enabled: boolean) => {
    setAnnouncement(text);
    setAnnouncementEnabled(enabled);
  };

  const handleAdminAuthenticated = () => {
    setIsAdminAuthenticated(true);
    setAdminModalOpen(false);
    setAdminPanelOpen(true);
  };

  const handleOpenAdminAccess = useCallback(() => setAdminModalOpen(true), []);

  const handleAdminLogout = async () => {
    try {
      await api.logoutAdmin();
    } catch {
      // Ignore
    }
    setIsAdminAuthenticated(false);
    setAdminPanelOpen(false);
  };

  // ============================================================
  // SPLASH SCREEN — shown for first 2.2 seconds
  // ============================================================
  if (showSplash) {
    return <SplashScreen onFinish={() => setShowSplash(false)} />;
  }

  // ============================================================
  // ADMIN PANEL
  // ============================================================
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
        currentAnnouncement={announcement}
        onAnnouncementSaved={handleAnnouncementSaved}
        onExit={() => setAdminPanelOpen(false)}
        onLogout={handleAdminLogout}
      />
    );
  }

  // ============================================================
  // ROUTE: /my-orders
  // ============================================================
  if (currentRoute === '/my-orders') {
    return (
      <div className="min-h-screen bg-[#08070d] text-zinc-100 flex flex-col">
        <Header
          hasSecondaryMovies={secondaryMovies.length > 0}
          onNavigate={handleNavigate}
          onOpenAdminAccess={handleOpenAdminAccess}
          onOpenMyOrders={() => navigateTo('/my-orders')}
          announcementText={announcement}
          announcementEnabled={announcementEnabled}
        />

        <main className="flex-1">
          <MyOrdersPage onBack={() => navigateTo('/')} />
        </main>

        <Footer
          onOpenInfo={setInfoModalContent}
          onOpenAdminAccess={handleOpenAdminAccess}
          onOpenMyOrders={() => navigateTo('/my-orders')}
        />

        <InfoModal
          content={infoModalContent}
          onClose={() => setInfoModalContent(null)}
        />
      </div>
    );
  }

  // ============================================================
  // ROUTE: / (Home)
  // ============================================================
  return (
    <div className="min-h-screen bg-[#08070d] text-zinc-100 flex flex-col selection:bg-purple-600 selection:text-white">
      <Header
        hasSecondaryMovies={secondaryMovies.length > 0}
        onNavigate={handleNavigate}
        onOpenAdminAccess={handleOpenAdminAccess}
        onOpenMyOrders={() => navigateTo('/my-orders')}
        announcementText={announcement}
        announcementEnabled={announcementEnabled}
      />

      <main className="flex-1 flex flex-col">
        {primaryFeaturedMovie ? (
          <FeaturedHero
            movie={primaryFeaturedMovie}
            onBuyNow={(movie) => setPurchaseMovie(movie)}
            onViewDetails={(movie) => setDetailsMovie(movie)}
          />
        ) : (
          <div className="py-20 text-center text-zinc-400">
            {storageSource === 'loading' ? (
              <p>Loading movies...</p>
            ) : (
              <p>No movies available right now.</p>
            )}
          </div>
        )}

        {secondaryMovies.length > 0 && (
          <SecondaryShowcase
            movies={secondaryMovies}
            onBuyNow={(movie) => setPurchaseMovie(movie)}
            onViewDetails={(movie) => setDetailsMovie(movie)}
          />
        )}
      </main>

      <Footer
        onOpenInfo={setInfoModalContent}
        onOpenAdminAccess={handleOpenAdminAccess}
        onOpenMyOrders={() => navigateTo('/my-orders')}
      />

      <PurchaseModal
        movie={purchaseMovie}
        onClose={() => setPurchaseMovie(null)}
      />

      <MovieDetailsModal
        movie={detailsMovie}
        onClose={() => setDetailsMovie(null)}
        onBuyNow={(movie) => {
          setDetailsMovie(null);
          setPurchaseMovie(movie);
        }}
      />

      <AdminAccessModal
        isOpen={adminModalOpen}
        onClose={() => setAdminModalOpen(false)}
        onAuthenticated={handleAdminAuthenticated}
      />

      <InfoModal
        content={infoModalContent}
        onClose={() => setInfoModalContent(null)}
      />
    </div>
  );
}
