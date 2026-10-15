import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Movie, TelegramConfig, InfoModalContent } from './types';
import {
  INITIAL_TELEGRAM_CONFIG,
  resolveFeaturedMovie,
  resolveSecondaryMovies,
  CURATED_SHOWCASE_MOVIES,
  ADDITIONAL_AVAILABLE_MOVIES,
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

const LOCAL_FALLBACK_MOVIES: Movie[] = [
  ...CURATED_SHOWCASE_MOVIES,
  ...ADDITIONAL_AVAILABLE_MOVIES,
];

export default function App() {
  const [movies, setMovies] = useState<Movie[]>(LOCAL_FALLBACK_MOVIES);
  const [adminMovies, setAdminMovies] = useState<Movie[]>(LOCAL_FALLBACK_MOVIES);
  const [telegramConfig, setTelegramConfig] = useState<TelegramConfig>(INITIAL_TELEGRAM_CONFIG);
  const [storageSource, setStorageSource] = useState<string>('local-sample');
  const [dbStatus, setDbStatus] = useState<any>({ connected: false, fallback: true });

  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);

  const [detailsMovie, setDetailsMovie] = useState<Movie | null>(null);
  const [purchaseMovie, setPurchaseMovie] = useState<Movie | null>(null);
  const [infoModalContent, setInfoModalContent] = useState<InfoModalContent | null>(null);

  // Silently try to load from server — fallback to local if fails
  const loadPublicStorefront = useCallback(async () => {
    try {
      const [moviesRes, healthRes] = await Promise.all([
        api.getPublicMovies(),
        api.checkHealth(),
      ]);

      if (moviesRes?.movies?.length > 0) {
        setMovies(moviesRes.movies);
        setStorageSource(moviesRes.storage || 'mongodb');
      }
      if (healthRes?.database) {
        setDbStatus(healthRes.database);
      }
    } catch (err: any) {
      // Silent fallback — website still works with local data
      console.warn('[FlixVault] Server unavailable, using local showcase:', err?.message);
      setMovies(LOCAL_FALLBACK_MOVIES);
      setStorageSource('local-sample');
      setDbStatus({ connected: false, fallback: true });
    }
  }, []);

  const loadAdminData = useCallback(async () => {
    try {
      const [adminMoviesRes, settingsRes] = await Promise.all([
        api.getAdminMovies(),
        api.getAdminSettings(),
      ]);

      if (adminMoviesRes?.movies?.length > 0) {
        setAdminMovies(adminMoviesRes.movies);
      }
      if (settingsRes?.settings?.telegramConfig) {
        setTelegramConfig(settingsRes.settings.telegramConfig);
      }
    } catch (err) {
      console.warn('[FlixVault] Admin data unavailable, using local:', err);
      setAdminMovies(LOCAL_FALLBACK_MOVIES);
    }
  }, []);

  useEffect(() => {
    loadPublicStorefront();
    api.checkAdminSession().then(setIsAdminAuthenticated).catch(() => {});
  }, [loadPublicStorefront]);

  useEffect(() => {
    if (adminPanelOpen) {
      loadAdminData();
    }
  }, [adminPanelOpen, loadAdminData]);

  const primaryFeaturedMovie = useMemo(() => {
    return resolveFeaturedMovie(movies);
  }, [movies]);

  const secondaryMovies = useMemo(() => {
    return resolveSecondaryMovies(movies, primaryFeaturedMovie?.id);
  }, [movies, primaryFeaturedMovie]);

  const handleNavigate = useCallback((sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  const handleAddMovie = async (newMovie: Movie) => {
    try {
      await api.createMovie(newMovie);
      await Promise.all([loadAdminData(), loadPublicStorefront()]);
    } catch (err: any) {
      console.error('Add movie failed:', err);
      // Local fallback
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

  const handleAdminAuthenticated = () => {
    setIsAdminAuthenticated(true);
    setAdminModalOpen(false);
    setAdminPanelOpen(true);
  };

  const handleOpenAdminAccess = useCallback(() => {
    setAdminModalOpen(true);
  }, []);

  const handleAdminLogout = async () => {
    try {
      await api.logoutAdmin();
    } catch {
      // Ignore
    }
    setIsAdminAuthenticated(false);
    setAdminPanelOpen(false);
  };

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
      <Header
        hasSecondaryMovies={secondaryMovies.length > 0}
        onNavigate={handleNavigate}
        onOpenAdminAccess={handleOpenAdminAccess}
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
            <p>No active featured movie currently published.</p>
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
