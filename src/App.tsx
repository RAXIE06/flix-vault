import React, { useEffect } from 'react';
import {
  X,
  Clock,
  Calendar,
  Film,
  ShieldCheck,
  ShoppingBag,
  Users,
  Languages,
} from 'lucide-react';
import { Movie } from '../types';
import { MoviePosterArt } from "./components/MoviePosterArt";

interface MovieDetailsModalProps {
  movie: Movie | null;
  onClose: () => void;
  onBuyNow: (movie: Movie) => void;
}

export const MovieDetailsModal: React.FC<MovieDetailsModalProps> = ({
  movie,
  onClose,
  onBuyNow,
}) => {
  // ESC key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (movie) window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [movie, onClose]);

  if (!movie) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-2xl bg-[#0e0a19] border-t sm:border border-purple-900/70 rounded-t-3xl sm:rounded-3xl shadow-2xl shadow-purple-950/90 text-left max-h-[92vh] overflow-y-auto"
        role="dialog"
        aria-modal="true"
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-20 p-2 text-white bg-black/60 hover:bg-black/80 rounded-full backdrop-blur-md transition-colors cursor-pointer"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Poster Header */}
        <div className="relative w-full aspect-[16/9] sm:aspect-[21/9] overflow-hidden bg-black">
          <MoviePosterArt
            movie={movie}
            variant="backdrop"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0e0a19] via-[#0e0a19]/40 to-transparent" />
        </div>

        {/* Content */}
        <div className="p-5 sm:p-8 space-y-5">
          
          {/* Title & Tagline */}
          <div>
            <h2 className="text-2xl sm:text-4xl font-extrabold text-white font-['Outfit'] leading-tight">
              {movie.title}
            </h2>
            {movie.tagline && (
              <p className="text-purple-300/90 text-xs sm:text-sm italic font-serif mt-1">
                &ldquo;{movie.tagline}&rdquo;
              </p>
            )}
          </div>

          {/* Metadata Row (Genre, Year, Duration, Rating) */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs sm:text-sm font-medium text-zinc-300">
            <span className="text-purple-400 font-semibold uppercase tracking-wider">
              {movie.genres.join(' · ')}
            </span>
            <span className="text-zinc-600">·</span>
            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-zinc-500" />
              {movie.year}
            </span>
            <span className="text-zinc-600">·</span>
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-zinc-500" />
              {movie.duration}
            </span>
            <span className="text-zinc-600">·</span>
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-zinc-800 border border-zinc-700">
              {movie.rating}
            </span>
          </div>

          {/* LANGUAGES ROW */}
          {movie.languages && movie.languages.length > 0 && (
            <div className="flex items-center gap-2">
              <Languages className="w-4 h-4 text-emerald-400 shrink-0" />
              <div className="flex flex-wrap gap-1.5">
                {movie.languages.map((lang) => (
                  <span
                    key={lang}
                    className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-950/60 border border-emerald-800/50 text-emerald-300 tracking-wide"
                  >
                    {lang}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Technical Specs (Resolution, Audio) */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-purple-950/60 border border-purple-800/50 text-purple-200">
              {movie.resolution}
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-purple-950/60 border border-purple-800/50 text-purple-200">
              {movie.audio}
            </span>
          </div>

          {/* Synopsis */}
          <div className="space-y-1">
            <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Synopsis
            </h4>
            <p className="text-sm text-zinc-300 leading-relaxed">
              {movie.synopsis}
            </p>
          </div>

          {/* Director & Cast */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-purple-950/40">
            <div>
              <h4 className="text-xs font-semibold text-zinc-500 flex items-center gap-1.5 mb-1">
                <Film className="w-3.5 h-3.5" /> Director
              </h4>
              <p className="text-sm text-zinc-200 font-medium">{movie.director}</p>
            </div>
            <div>
              <h4 className="text-xs font-semibold text-zinc-500 flex items-center gap-1.5 mb-1">
                <Users className="w-3.5 h-3.5" /> Cast
              </h4>
              <p className="text-sm text-zinc-200 font-medium line-clamp-2">
                {movie.cast.join(', ')}
              </p>
            </div>
          </div>

          {/* Price & Buy Button */}
          <div className="pt-4 border-t border-purple-950/60 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <span className="text-[10px] text-zinc-500 uppercase font-mono block">Price</span>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-white font-['Outfit']">
                  {movie.priceSample}
                </span>
                <span className="text-[11px] text-zinc-400">(Permanent Access)</span>
              </div>
            </div>

            <button
              onClick={() => onBuyNow(movie)}
              className="w-full sm:w-auto min-h-[48px] px-8 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-violet-700 hover:from-purple-500 hover:to-violet-600 text-white font-bold text-sm shadow-lg shadow-purple-950/80 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>Buy Now</span>
            </button>
          </div>

          {/* Trust Badge */}
          <div className="flex items-center justify-center gap-1.5 text-[10px] text-zinc-500 pt-2">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            <span>100% Secure UPI Payment · Instant Telegram Delivery</span>
          </div>

        </div>
      </div>
    </div>
  );
};
