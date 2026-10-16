import React, { useRef, useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Star, Info, ShoppingBag } from 'lucide-react';
import { Movie } from '../types';
import { MoviePosterArt } from './MoviePosterArt';

interface MovieRowProps {
  title: string;
  movies: Movie[];
  onBuyNow: (movie: Movie) => void;
  onViewDetails: (movie: Movie) => void;
  /** Optional small subtitle under title */
  subtitle?: string;
  /** Optional accent color for the title left-border */
  accentColor?: string;
}

export const MovieRow: React.FC<MovieRowProps> = ({
  title,
  movies,
  onBuyNow,
  onViewDetails,
  subtitle,
  accentColor = '#a855f7',
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Check scroll position and update arrow visibility
  const checkScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 10);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 10);
  };

  useEffect(() => {
    checkScroll();
    const el = scrollRef.current;
    if (!el) return;

    el.addEventListener('scroll', checkScroll, { passive: true });
    window.addEventListener('resize', checkScroll);

    return () => {
      el.removeEventListener('scroll', checkScroll);
      window.removeEventListener('resize', checkScroll);
    };
  }, [movies]);

  const scroll = (direction: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;

    const cardWidth = 220; // approximate card width + gap
    const scrollAmount = cardWidth * 3; // scroll 3 cards at a time

    el.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  };

  if (!movies || movies.length === 0) return null;

  return (
    <section className="w-full py-6 sm:py-8 bg-[#08070d]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">

        {/* ROW HEADER */}
        <div className="flex items-end justify-between mb-4">
          <div className="flex items-center gap-3">
            <div
              className="w-1 h-6 sm:h-7 rounded-full"
              style={{ backgroundColor: accentColor }}
            />
            <div>
              <h2 className="text-lg sm:text-2xl font-bold text-white tracking-tight font-['Outfit']">
                {title}
              </h2>
              {subtitle && (
                <p className="text-[11px] sm:text-xs text-zinc-500 mt-0.5">
                  {subtitle}
                </p>
              )}
            </div>
          </div>

          {/* Arrow Controls (Desktop only) */}
          <div className="hidden sm:flex items-center gap-1.5">
            <button
              onClick={() => scroll('left')}
              disabled={!canScrollLeft}
              className="p-2 rounded-lg bg-[#140f24] border border-purple-950/60 hover:bg-purple-950/50 text-zinc-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
              aria-label="Scroll left"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => scroll('right')}
              disabled={!canScrollRight}
              className="p-2 rounded-lg bg-[#140f24] border border-purple-950/60 hover:bg-purple-950/50 text-zinc-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
              aria-label="Scroll right"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* SCROLLING MOVIES ROW */}
        <div className="relative">
          {/* Left fade gradient */}
          {canScrollLeft && (
            <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-12 z-10 bg-gradient-to-r from-[#08070d] to-transparent" />
          )}

          {/* Right fade gradient */}
          {canScrollRight && (
            <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-12 z-10 bg-gradient-to-l from-[#08070d] to-transparent" />
          )}

          <div
            ref={scrollRef}
            className="flex gap-3 sm:gap-4 overflow-x-auto scrollbar-hide scroll-smooth pb-2"
            style={{
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
            }}
          >
            {movies.map((movie) => (
              <MovieRowCard
                key={movie.id}
                movie={movie}
                onBuyNow={onBuyNow}
                onViewDetails={onViewDetails}
              />
            ))}
          </div>
        </div>

      </div>
    </section>
  );
};

// ============================================================
// Individual Card in the row
// ============================================================
interface MovieRowCardProps {
  movie: Movie;
  onBuyNow: (movie: Movie) => void;
  onViewDetails: (movie: Movie) => void;
}

const MovieRowCard: React.FC<MovieRowCardProps> = ({
  movie,
  onBuyNow,
  onViewDetails,
}) => {
  return (
    <div
      className="group relative shrink-0 w-[150px] sm:w-[190px] rounded-xl overflow-hidden bg-[#0c0915] border border-purple-950/60 hover:border-purple-600/70 transition-all duration-300 hover:shadow-lg hover:shadow-purple-950/50 cursor-pointer"
      onClick={() => onViewDetails(movie)}
    >
      {/* Poster */}
      <div className="relative w-full aspect-[2/3] overflow-hidden bg-black">
        <MoviePosterArt
          movie={movie}
          variant="compact"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0c0915] via-transparent to-transparent opacity-80" />

        {/* Resolution badge (top-right) */}
        <div className="absolute top-2 right-2">
          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono tracking-wide bg-black/80 backdrop-blur-md border border-purple-800/50 text-purple-200">
            {movie.resolution}
          </span>
        </div>

        {/* Price badge (bottom-left) */}
        <div className="absolute bottom-2 left-2">
          <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-gradient-to-r from-purple-600 to-violet-700 text-white shadow-md">
            {movie.priceSample}
          </span>
        </div>

        {/* Hover overlay with buttons */}
        <div className="absolute inset-0 bg-black/85 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col items-center justify-center gap-2 p-3">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onBuyNow(movie);
            }}
            className="w-full py-2 px-3 rounded-lg bg-gradient-to-r from-purple-600 to-violet-700 hover:from-purple-500 hover:to-violet-600 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>Buy Now</span>
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onViewDetails(movie);
            }}
            className="w-full py-2 px-3 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <Info className="w-3.5 h-3.5" />
            <span>Details</span>
          </button>
        </div>
      </div>

      {/* Card Info (below poster) */}
      <div className="p-2.5 space-y-1">
        <h3 className="text-[13px] font-bold text-white truncate font-['Outfit'] group-hover:text-purple-300 transition-colors">
          {movie.title}
        </h3>
        <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 font-mono">
          <span>{movie.year}</span>
          <span>·</span>
          <span className="truncate">{movie.genres[0]}</span>
          <span>·</span>
          <span className="flex items-center gap-0.5">
            <Star className="w-2.5 h-2.5 text-amber-400 fill-amber-400" />
            {movie.rating}
          </span>
        </div>
      </div>
    </div>
  );
};
