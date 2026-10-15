import React, { useState, useEffect } from 'react';
import { X, ShoppingBag, Clock, Film, Shield, Sparkles } from 'lucide-react';
import { Movie } from '../types';
import { MoviePosterArt } from './MoviePosterArt';

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
      
      {/* Modal Dialog Card: Mobile-first sheet */}
      <div
        className="relative w-full max-w-2xl bg-[#0c0915] border-t sm:border border-purple-950/90 rounded-t-2xl sm:rounded-2xl overflow-hidden shadow-2xl shadow-purple-950/80 max-h-[92vh] overflow-y-auto text-left"
        role="dialog"
        aria-modal="true"
        aria-labelledby="movie-modal-title"
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-20 p-2 text-zinc-400 hover:text-white bg-black/70 hover:bg-zinc-800 rounded-full transition-colors cursor-pointer"
          aria-label="Close movie specifications"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Media Banner */}
        <div className="relative w-full aspect-[16/9] sm:aspect-[21/9] overflow-hidden bg-black">
          <MoviePosterArt
            movie={movie}
            variant="backdrop"
            className="w-full h-full object-cover scale-102"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0c0915] via-[#0c0915]/50 to-transparent" />

          {/* Badges */}
          <div className="absolute bottom-3 left-4 flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded text-[10px] font-mono font-medium tracking-wide bg-purple-950/90 text-purple-200 border border-purple-700/50">
              {movie.resolution}
            </span>
            <span className="px-2.5 py-0.5 rounded text-[10px] font-mono font-medium tracking-wide bg-black/80 text-zinc-300 border border-zinc-800">
              {movie.audio}
            </span>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-7 space-y-4">
          
          {/* Genre and Year */}
          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400 font-medium">
            <span className="text-purple-400 font-semibold">{movie.genres.join(' · ')}</span>
            <span aria-hidden="true" className="text-zinc-600">·</span>
            <span className="font-mono">{movie.year}</span>
            <span aria-hidden="true" className="text-zinc-600">·</span>
            <span>{movie.duration}</span>
            <span aria-hidden="true" className="text-zinc-600">·</span>
            <span className="px-1.5 py-0.2 rounded text-[10px] bg-zinc-800 text-zinc-300">
              {movie.rating}
            </span>
          </div>

          {/* Title & Tagline */}
          <div>
            <h2 id="movie-modal-title" className="text-2xl sm:text-3xl font-extrabold text-white font-['Outfit'] tracking-tight">
              {movie.title}
            </h2>
            {movie.tagline && (
              <p className="text-xs sm:text-sm text-purple-300/80 italic mt-0.5 font-serif">
                &ldquo;{movie.tagline}&rdquo;
              </p>
            )}
          </div>

          {/* Synopsis */}
          <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
            {movie.synopsis}
          </p>

          {/* Cast & Director specs */}
          <div className="pt-2 border-t border-purple-950/60 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-zinc-500 block">Director</span>
              <span className="text-zinc-200 font-medium">{movie.director}</span>
            </div>
            <div>
              <span className="text-zinc-500 block">Starring Cast</span>
              <span className="text-zinc-200 font-medium">{movie.cast.join(', ')}</span>
            </div>
          </div>

          {/* Action Row */}
          <div className="pt-3 border-t border-purple-950/60 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div>
              <span className="text-[10px] uppercase font-mono text-zinc-500 block">Price</span>
              <div className="text-xl font-bold text-white font-['Outfit'] tabular-nums">
                {movie.priceSample}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-medium transition-colors cursor-pointer"
              >
                Close
              </button>
              <button
                onClick={() => {
                  onClose();
                  onBuyNow(movie);
                }}
                className="flex-1 sm:flex-none min-h-[44px] px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-violet-700 hover:from-purple-500 hover:to-violet-600 text-white font-bold text-xs sm:text-sm shadow-md shadow-purple-950 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
              >
                <ShoppingBag className="w-4 h-4" />
                <span>Get This Movie — {movie.priceSample}</span>
              </button>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
};
