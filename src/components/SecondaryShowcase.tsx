import React from 'react';
import { ShoppingBag, Info, Film, Clock, Sparkles, Languages } from 'lucide-react';
import { Movie } from '../types';
import { MoviePosterArt } from './MoviePosterArt';

interface SecondaryShowcaseProps {
  movies: Movie[];
  onBuyNow: (movie: Movie) => void;
  onViewDetails: (movie: Movie) => void;
}

export const SecondaryShowcase: React.FC<SecondaryShowcaseProps> = ({
  movies,
  onBuyNow,
  onViewDetails,
}) => {
  if (!movies || movies.length === 0) {
    return null;
  }

  const isSingleSecondary = movies.length === 1;

  return (
    <section id="secondary-collection" className="w-full py-8 sm:py-14 bg-[#08070d]">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        
        {/* Section Header */}
        <div className="mb-6 sm:mb-8 text-left">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-purple-400 mb-1">
            <Film className="w-4 h-4" />
            <span>
              {isSingleSecondary ? 'Spotlight Release' : 'More Premium Releases'}
            </span>
          </div>
          <h2 className="text-xl sm:text-3xl font-bold text-white tracking-tight font-['Outfit']">
            {isSingleSecondary
              ? 'Also Available in the Vault'
              : 'Curated Vault Collection'}
          </h2>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1">
            Carefully selected cinema titles available for permanent digital ownership.
          </p>
        </div>

        {/* Case A: Single Secondary Movie */}
        {isSingleSecondary ? (
          <div className="rounded-2xl overflow-hidden bg-[#0d0917] border border-purple-900/40 shadow-xl shadow-purple-950/60 p-5 sm:p-7">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
              
              <div className="md:col-span-5 rounded-xl overflow-hidden bg-black aspect-[16/10] sm:aspect-[4/3] md:aspect-[3/4]">
                <MoviePosterArt movie={movies[0]} variant="poster" className="w-full h-full object-cover" />
              </div>

              <div className="md:col-span-7 space-y-3.5 text-left">
                <div className="flex items-center gap-2 text-xs text-zinc-400 font-medium">
                  <span className="text-purple-400 font-semibold">{movies[0].genres.join(' · ')}</span>
                  <span aria-hidden="true" className="text-zinc-600">·</span>
                  <span className="font-mono">{movies[0].year}</span>
                  <span aria-hidden="true" className="text-zinc-600">·</span>
                  <span>{movies[0].duration}</span>
                  <span aria-hidden="true" className="text-zinc-600">·</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-purple-950 text-purple-200 border border-purple-800/40 font-mono">
                    {movies[0].resolution}
                  </span>
                </div>

                <h3 className="text-2xl sm:text-3xl font-extrabold text-white font-['Outfit']">
                  {movies[0].title}
                </h3>

                {/* Languages Row */}
                {movies[0].languages && movies[0].languages.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Languages className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    {movies[0].languages.map((lang) => (
                      <span
                        key={lang}
                        className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-950/60 border border-emerald-800/50 text-emerald-300 tracking-wide"
                      >
                        {lang}
                      </span>
                    ))}
                  </div>
                )}

                <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed line-clamp-3">
                  {movies[0].synopsis}
                </p>

                <div className="text-xs text-zinc-400 pt-1">
                  <span className="text-zinc-500">Director: </span>
                  <span className="text-zinc-200 font-medium">{movies[0].director}</span>
                </div>

                <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <button
                    onClick={() => onBuyNow(movies[0])}
                    className="min-h-[48px] px-6 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-violet-700 hover:from-purple-500 hover:to-violet-600 text-white font-bold text-sm shadow-lg shadow-purple-950/70 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
                  >
                    <ShoppingBag className="w-4 h-4" />
                    <span>Get This Movie — {movies[0].priceSample}</span>
                  </button>

                  <button
                    onClick={() => onViewDetails(movies[0])}
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-[#151024] hover:bg-[#1d1633] text-zinc-300 hover:text-white border border-purple-900/40 text-xs font-medium transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Info className="w-4 h-4 text-purple-400" />
                    <span>View Details</span>
                  </button>
                </div>
              </div>

            </div>
          </div>
        ) : (
          /* Case B: Multiple Secondary Movies */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {movies.map((movie) => (
              <div
                key={movie.id}
                className="group rounded-2xl overflow-hidden bg-[#0c0915] border border-purple-950/70 hover:border-purple-700/60 transition-all duration-300 shadow-xl shadow-purple-950/40 flex flex-col justify-between"
              >
                <div>
                  <div className="relative w-full aspect-[16/10] sm:aspect-[16/9] overflow-hidden bg-black/70">
                    <MoviePosterArt
                      movie={movie}
                      variant="poster"
                      className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-500"
                    />
                    
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0c0915] via-[#0c0915]/40 to-transparent" />

                    <div className="absolute top-3 right-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono tracking-wider bg-black/80 backdrop-blur-md border border-purple-800/50 text-purple-200">
                        {movie.resolution}
                      </span>
                    </div>

                    <div className="absolute bottom-3 left-4 right-4">
                      <div className="flex items-center gap-1.5 text-[11px] font-medium text-purple-300">
                        <span>{movie.genres.join(' · ')}</span>
                        <span aria-hidden="true" className="text-zinc-600">·</span>
                        <span className="font-mono text-zinc-300">{movie.year}</span>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 sm:p-5 text-left space-y-2">
                    <h3 className="text-xl sm:text-2xl font-bold text-white font-['Outfit'] tracking-tight group-hover:text-purple-300 transition-colors">
                      {movie.title}
                    </h3>

                    {/* Languages Row */}
                    {movie.languages && movie.languages.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Languages className="w-3 h-3 text-emerald-400 shrink-0" />
                        {movie.languages.slice(0, 4).map((lang) => (
                          <span
                            key={lang}
                            className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-950/60 border border-emerald-800/50 text-emerald-300 tracking-wide"
                          >
                            {lang}
                          </span>
                        ))}
                        {movie.languages.length > 4 && (
                          <span className="text-[9px] text-zinc-500 font-mono">
                            +{movie.languages.length - 4}
                          </span>
                        )}
                      </div>
                    )}

                    <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed line-clamp-2">
                      {movie.synopsis}
                    </p>

                    <div className="text-[11px] text-zinc-500 pt-1">
                      Director: <span className="text-zinc-300">{movie.director}</span>
                    </div>
                  </div>
                </div>

                <div className="p-4 sm:p-5 pt-0">
                  <div className="pt-3 border-t border-purple-950/60 flex items-center justify-between gap-3">
                    <div>
                      <span className="text-[10px] text-zinc-500 uppercase font-mono block">Price</span>
                      <span className="text-lg font-bold text-white font-['Outfit'] tabular-nums">
                        {movie.priceSample}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onViewDetails(movie)}
                        className="p-2.5 rounded-lg bg-[#151022] hover:bg-[#1d1633] text-zinc-300 hover:text-white border border-purple-900/40 transition-colors cursor-pointer"
                        title="View Full Specifications"
                        aria-label={`View details for ${movie.title}`}
                      >
                        <Info className="w-4 h-4 text-purple-400" />
                      </button>

                      <button
                        onClick={() => onBuyNow(movie)}
                        className="min-h-[44px] px-4 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-violet-700 hover:from-purple-500 hover:to-violet-600 text-white font-bold text-xs sm:text-sm shadow-md shadow-purple-950/70 transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                      >
                        <ShoppingBag className="w-3.5 h-3.5" />
                        <span>Get Movie</span>
                      </button>
                    </div>
                  </div>
                </div>

              </div>
            ))}
          </div>
        )}

      </div>
    </section>
  );
};
