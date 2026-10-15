import React from 'react';
import { X, Smartphone, ShoppingBag, Info, Sparkles, Film, Clock } from 'lucide-react';
import { Movie } from '../../types';
import { MoviePosterArt } from '../MoviePosterArt';

interface MobilePreviewModalProps {
  movie: Movie | null;
  onClose: () => void;
}

export const MobilePreviewModal: React.FC<MobilePreviewModalProps> = ({
  movie,
  onClose,
}) => {
  if (!movie) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/90 backdrop-blur-md animate-in fade-in duration-200">
      
      <div
        className="relative w-full max-w-md bg-[#0c0917] border border-purple-900/60 rounded-3xl p-4 sm:p-6 shadow-2xl shadow-purple-950/90 text-left flex flex-col items-center"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-preview-title"
      >
        {/* Modal Controls Header */}
        <div className="w-full flex items-center justify-between mb-4 pb-3 border-b border-purple-950/60">
          <div className="flex items-center gap-2 text-xs font-semibold text-purple-300">
            <Smartphone className="w-4 h-4 text-purple-400" />
            <span id="mobile-preview-title">Mobile Storefront Viewport (390px Simulation)</span>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 390px Device Simulator Frame */}
        <div className="w-full max-w-[390px] h-[640px] rounded-[38px] border-4 border-[#291f42] bg-[#08070d] overflow-hidden shadow-2xl shadow-purple-950/80 flex flex-col relative ring-1 ring-purple-500/20">
          
          {/* Simulated Mobile Speaker & Status Bar */}
          <div className="w-full h-7 bg-[#0a0812] flex items-center justify-between px-6 shrink-0 text-[10px] text-zinc-400 font-mono select-none">
            <span>9:41</span>
            <div className="w-20 h-4 bg-black rounded-full" />
            <span>5G 100%</span>
          </div>

          {/* Simulated Compact FlixVault Header */}
          <div className="h-12 bg-[#08070d]/95 border-b border-purple-950/60 px-4 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-6 rounded bg-gradient-to-br from-purple-600 to-violet-900 flex items-center justify-center">
                <Film className="w-3 h-3 text-white" />
              </div>
              <span className="text-sm font-bold text-white font-['Outfit']">
                Flix<span className="text-purple-400">Vault</span>
              </span>
            </div>
            <span className="text-[10px] font-mono text-purple-300 bg-purple-950/80 px-2 py-0.5 rounded border border-purple-800/40">
              4K MASTER
            </span>
          </div>

          {/* Scrollable Mobile Viewport Content */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin">
            
            {/* Card Preview Container */}
            <div className="rounded-2xl overflow-hidden bg-gradient-to-b from-[#130d22] to-[#0a0713] border border-purple-800/40 p-0 shadow-lg">
              
              {/* Artwork Media Area */}
              <div className="relative w-full aspect-[16/11] bg-black overflow-hidden">
                <MoviePosterArt movie={movie} variant="poster" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#130d22] via-[#130d22]/40 to-transparent" />
                
                {movie.isFeatured && (
                  <div className="absolute top-2.5 left-2.5">
                    <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-purple-600 text-white flex items-center gap-1">
                      <Sparkles className="w-2.5 h-2.5" />
                      <span>Featured</span>
                    </span>
                  </div>
                )}

                <div className="absolute top-2.5 right-2.5">
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-black/80 text-purple-200 border border-purple-800/50">
                    {movie.resolution}
                  </span>
                </div>
              </div>

              {/* Information & Purchase Block */}
              <div className="p-4 space-y-2.5 text-left">
                <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 font-medium">
                  <span className="text-purple-400 font-semibold">{movie.genres.join(' · ')}</span>
                  <span>·</span>
                  <span className="font-mono">{movie.year}</span>
                  <span>·</span>
                  <span>{movie.duration}</span>
                </div>

                <h3 className="text-xl font-extrabold text-white font-['Outfit'] leading-tight">
                  {movie.title}
                </h3>

                {movie.tagline && (
                  <p className="text-[11px] text-purple-300 italic font-serif">
                    &ldquo;{movie.tagline}&rdquo;
                  </p>
                )}

                <p className="text-[11px] text-zinc-300 leading-relaxed line-clamp-3">
                  {movie.synopsis}
                </p>

                {/* Price Bar */}
                <div className="p-2.5 rounded-xl bg-[#0b0814] border border-purple-900/50 flex items-center justify-between">
                  <div>
                    <span className="text-[9px] text-purple-400 uppercase font-mono block">Price</span>
                    <span className="text-base font-extrabold text-white font-['Outfit']">
                      {movie.priceSample}
                    </span>
                  </div>
                  <span className="text-[10px] text-zinc-400 font-mono">
                    {movie.audio}
                  </span>
                </div>

                {/* Purchase Button */}
                <button
                  type="button"
                  className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-gradient-to-r from-purple-600 to-violet-700 text-white font-bold text-xs shadow-md shadow-purple-950 flex items-center justify-center gap-2 pointer-events-none"
                >
                  <ShoppingBag className="w-4 h-4" />
                  <span>Get This Movie — {movie.priceSample}</span>
                </button>

                <div className="text-[10px] text-center text-zinc-500 pt-0.5">
                  ✓ Instant 4K Digital Streaming
                </div>
              </div>

            </div>

          </div>

          {/* Simulated Home Indicator Bar */}
          <div className="w-full h-4 bg-[#08070d] flex items-center justify-center shrink-0">
            <div className="w-32 h-1 bg-zinc-600 rounded-full" />
          </div>

        </div>

      </div>

    </div>
  );
};
