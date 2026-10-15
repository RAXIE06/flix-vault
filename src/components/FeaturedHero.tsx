import React from 'react';
import { ShoppingBag, Info, Sparkles, Clock, Film, ShieldCheck, Play } from 'lucide-react';
import { Movie } from '../types';
import { MoviePosterArt } from './MoviePosterArt';

interface FeaturedHeroProps {
  movie: Movie;
  onBuyNow: (movie: Movie) => void;
  onViewDetails: (movie: Movie) => void;
}

export const FeaturedHero: React.FC<FeaturedHeroProps> = ({
  movie,
  onBuyNow,
  onViewDetails,
}) => {
  return (
    <section id="featured-showcase" className="w-full pt-4 pb-10 sm:py-12 bg-[#08070d]">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        
        {/* Cinematic Featured Container with Soft Purple Border & Glow */}
        <div className="relative rounded-2xl sm:rounded-3xl overflow-hidden bg-gradient-to-b from-[#130d22] to-[#0a0713] border border-purple-800/40 shadow-2xl shadow-purple-950/80">
          
          {/* Subtle Ambient Radial Glow */}
          <div className="absolute top-0 right-1/4 w-72 sm:w-96 h-72 sm:h-96 bg-purple-600/15 rounded-full blur-[100px] pointer-events-none" />

          {/* Responsive Split / Stacked Layout: Mobile-first */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-0 md:gap-8 items-center">
            
            {/* Featured Artwork: Substantial Mobile Visual Anchor */}
            <div className="md:col-span-5 relative w-full overflow-hidden bg-black/60">
              {/* Artwork wrapper: 16/10 on mobile for great vertical rhythm, 3/4 portrait on desktop */}
              <div className="relative w-full aspect-[16/11] sm:aspect-[4/3] md:aspect-[3/4] overflow-hidden">
                <MoviePosterArt
                  movie={movie}
                  variant="poster"
                  className="w-full h-full object-cover"
                />
                
                {/* Seamless scrim overlay fading smoothly into content */}
                <div className="absolute inset-0 bg-gradient-to-t from-[#130d22] via-[#130d22]/40 to-transparent md:hidden" />
                <div className="hidden md:block absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-[#130d22]/80" />

                {/* Top Corner Badges */}
                <div className="absolute top-3 left-3 flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-gradient-to-r from-purple-600 to-violet-600 text-white shadow-md shadow-purple-950 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-purple-200" />
                    <span>Featured Pick</span>
                  </span>
                </div>

                <div className="absolute top-3 right-3">
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono tracking-wider bg-black/80 backdrop-blur-md border border-purple-800/50 text-purple-200">
                    {movie.resolution}
                  </span>
                </div>
              </div>
            </div>

            {/* Featured Movie Information & Purchase CTA */}
            <div className="md:col-span-7 p-5 sm:p-7 md:p-8 flex flex-col justify-center space-y-4 text-left">
              
              {/* Category, Year, and Duration */}
              <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-zinc-400">
                <span className="text-purple-400 font-semibold uppercase tracking-wider text-[11px]">
                  {movie.genres.join(' · ')}
                </span>
                <span aria-hidden="true" className="text-zinc-600">·</span>
                <span className="font-mono text-zinc-300">{movie.year}</span>
                <span aria-hidden="true" className="text-zinc-600">·</span>
                <span className="flex items-center gap-1 text-zinc-300">
                  <Clock className="w-3 h-3 text-zinc-500" />
                  {movie.duration}
                </span>
                <span aria-hidden="true" className="text-zinc-600">·</span>
                <span className="text-zinc-400">{movie.rating}</span>
              </div>

              {/* Prominent Title */}
              <h1 className="text-2xl sm:text-4xl md:text-5xl font-extrabold text-white tracking-tight leading-[1.1] font-['Outfit']">
                {movie.title}
              </h1>

              {/* Tagline / Hook */}
              {movie.tagline && (
                <p className="text-purple-300/90 text-xs sm:text-sm italic font-serif">
                  &ldquo;{movie.tagline}&rdquo;
                </p>
              )}

              {/* Compelling Short Description */}
              <p className="text-zinc-300 text-xs sm:text-sm leading-relaxed line-clamp-3 sm:line-clamp-4">
                {movie.synopsis}
              </p>

              {/* Director & Cast */}
              <div className="text-[11px] sm:text-xs text-zinc-400 flex flex-wrap items-center gap-x-3 gap-y-1 pt-1">
                <div>
                  <span className="text-zinc-500">Director: </span>
                  <span className="text-zinc-200 font-medium">{movie.director}</span>
                </div>
                <span className="text-zinc-600 hidden xs:inline" aria-hidden="true">·</span>
                <div>
                  <span className="text-zinc-500">Cast: </span>
                  <span className="text-zinc-200 font-medium">{movie.cast.slice(0, 2).join(', ')}</span>
                </div>
              </div>

              {/* Purchase Box & Instant Price Callout */}
              <div className="pt-2 sm:pt-4">
                <div className="p-3.5 sm:p-4 rounded-xl bg-[#0b0814] border border-purple-900/50 flex items-center justify-between gap-3 mb-3">
                  <div>
                    <span className="text-[10px] uppercase font-mono tracking-wider text-purple-400 block font-semibold">
                      Digital Edition Price
                    </span>
                    <div className="flex items-baseline gap-1.5 mt-0.5">
                      <span className="text-2xl sm:text-3xl font-extrabold text-white font-['Outfit'] tabular-nums tracking-tight">
                        {movie.priceSample}
                      </span>
                      <span className="text-[11px] text-zinc-400">
                        (Instant 4K Playback)
                      </span>
                    </div>
                  </div>

                  <div className="text-right hidden xs:block">
                    <span className="text-[10px] text-zinc-500 block font-mono">Audio Master</span>
                    <span className="text-xs text-zinc-300 font-medium">{movie.audio}</span>
                  </div>
                </div>

                {/* Primary Purchase Button: Large, high-visibility purple gradient (touch target >= 48px) */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                  <button
                    onClick={() => onBuyNow(movie)}
                    className="w-full sm:flex-1 min-h-[48px] sm:min-h-[52px] px-6 py-3 rounded-xl bg-gradient-to-r from-purple-600 via-purple-700 to-violet-800 hover:from-purple-500 hover:to-violet-700 text-white font-bold text-sm sm:text-base shadow-xl shadow-purple-950/80 transition-all flex items-center justify-center gap-2.5 cursor-pointer transform active:scale-[0.98]"
                  >
                    <ShoppingBag className="w-5 h-5 text-purple-200" />
                    <span>Get This Movie — {movie.priceSample}</span>
                  </button>

                  <button
                    onClick={() => onViewDetails(movie)}
                    className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#181128] hover:bg-[#231a38] text-zinc-300 hover:text-white border border-purple-900/40 text-xs sm:text-sm font-medium transition-colors flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Info className="w-4 h-4 text-purple-400" />
                    <span>View Details</span>
                  </button>
                </div>

                {/* Subtle reassurance note */}
                <p className="text-[10px] text-zinc-500 text-center sm:text-left mt-2.5 flex items-center justify-center sm:justify-start gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
                  <span>Permanent streaming license · 4K Ultra HD master download</span>
                </p>
              </div>

            </div>

          </div>

        </div>

      </div>
    </section>
  );
};
