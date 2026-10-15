import React from 'react';
import { Play, Info, Sparkles, Film, Clock, Award } from 'lucide-react';
import { Movie } from '../types';
import { MoviePosterArt } from './MoviePosterArt';

interface HeroProps {
  movie: Movie;
  onViewDetails: (movie: Movie) => void;
  onBrowseMovies: () => void;
}

export const Hero: React.FC<HeroProps> = ({
  movie,
  onViewDetails,
  onBrowseMovies,
}) => {
  return (
    <section id="hero" className="relative w-full overflow-hidden bg-[#08070d] border-b border-purple-950/30">
      {/* Background Graphic Asset with Cinematic Gradient Overlay */}
      <div className="relative w-full min-h-[580px] lg:min-h-[640px] flex items-center">
        
        {/* Cinematic Backdrop Visual */}
        <div className="absolute inset-0 z-0">
          <MoviePosterArt
            movie={movie}
            variant="backdrop"
            className="w-full h-full object-cover scale-105"
          />
          {/* Multi-layered cinematic gradient scrim */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#08070d] via-[#08070d]/75 to-black/30" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#08070d] via-[#08070d]/80 to-transparent" />
          <div className="absolute inset-0 bg-radial-at-c from-transparent via-[#08070d]/50 to-[#08070d]" />
        </div>

        {/* Ambient Purple Glow Accents */}
        <div className="absolute top-1/4 left-1/3 w-96 h-96 bg-purple-700/15 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-10 right-10 w-80 h-80 bg-violet-600/10 rounded-full blur-[100px] pointer-events-none" />

        {/* Content Container */}
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-24 w-full">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
            
            {/* Left Column: Headline and Actions */}
            <div className="lg:col-span-8 flex flex-col justify-center space-y-5">
              
              {/* Category, Year, and Format Spec Strip */}
              <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm font-medium">
                <span className="text-purple-400 font-semibold tracking-wider uppercase text-xs">
                  Featured Premiere
                </span>
                <span className="text-zinc-500" aria-hidden="true">·</span>
                <span className="text-zinc-300">{movie.genres.join(', ')}</span>
                <span className="text-zinc-500" aria-hidden="true">·</span>
                <span className="text-zinc-300 font-mono">{movie.year}</span>
                <span className="text-zinc-500" aria-hidden="true">·</span>
                <span className="text-zinc-400 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-zinc-500" />
                  {movie.duration}
                </span>
                <span className="text-zinc-500" aria-hidden="true">·</span>
                <span className="px-1.5 py-0.5 rounded text-[11px] font-mono tracking-tight bg-purple-950/80 border border-purple-800/40 text-purple-200">
                  {movie.resolution}
                </span>
              </div>

              {/* Title */}
              <h1 className="text-3xl sm:text-5xl md:text-6xl font-extrabold text-white tracking-tight leading-[1.08] font-['Outfit']">
                {movie.title}
              </h1>

              {/* Tagline / Kicker */}
              <p className="text-purple-300/90 text-sm sm:text-base italic font-serif max-w-xl">
                &ldquo;{movie.tagline}&rdquo;
              </p>

              {/* Synopsis */}
              <p className="text-zinc-300 text-sm sm:text-base leading-relaxed max-w-2xl line-clamp-3 sm:line-clamp-4">
                {movie.synopsis}
              </p>

              {/* Metadata details line */}
              <div className="pt-1 text-xs text-zinc-400 flex flex-wrap items-center gap-x-4 gap-y-1">
                <div>
                  <span className="text-zinc-500">Director: </span>
                  <span className="text-zinc-300">{movie.director}</span>
                </div>
                <span className="text-zinc-600 hidden sm:inline" aria-hidden="true">·</span>
                <div>
                  <span className="text-zinc-500">Starring: </span>
                  <span className="text-zinc-300">{movie.cast.join(', ')}</span>
                </div>
                <span className="text-zinc-600 hidden sm:inline" aria-hidden="true">·</span>
                <div>
                  <span className="text-zinc-500">Access: </span>
                  <span className="text-purple-300 font-medium">{movie.accessLabel}</span>
                </div>
              </div>

              {/* CTA Action Buttons */}
              <div className="pt-3 flex flex-wrap items-center gap-3 sm:gap-4">
                <button
                  onClick={() => onViewDetails(movie)}
                  className="px-6 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-violet-700 hover:from-purple-500 hover:to-violet-600 text-white font-semibold text-sm shadow-lg shadow-purple-950/60 flex items-center gap-2.5 transition-all transform hover:-translate-y-0.5 active:translate-y-0"
                >
                  <Info className="w-4 h-4 text-purple-200" />
                  <span>View Details</span>
                </button>

                <button
                  onClick={onBrowseMovies}
                  className="px-6 py-3 rounded-xl bg-[#141021]/80 hover:bg-[#1f1933] text-zinc-200 hover:text-white border border-purple-900/40 hover:border-purple-600/50 font-medium text-sm flex items-center gap-2.5 transition-all"
                >
                  <Film className="w-4 h-4 text-purple-400" />
                  <span>Browse Movies</span>
                </button>
              </div>

            </div>

            {/* Right Column: Mini Poster Showcase Card */}
            <div className="hidden lg:flex lg:col-span-4 justify-end">
              <div className="relative group w-64 xl:w-72 rounded-2xl overflow-hidden p-1 bg-gradient-to-b from-purple-500/30 via-purple-950/20 to-transparent shadow-2xl shadow-black/80">
                <div className="rounded-xl overflow-hidden border border-purple-900/40">
                  <MoviePosterArt movie={movie} variant="poster" />
                </div>
                <div className="absolute bottom-4 left-4 right-4 p-3 rounded-xl bg-[#0d0a17]/90 backdrop-blur-md border border-purple-800/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <p className="text-xs text-purple-300 font-medium text-center">
                    Click &ldquo;View Details&rdquo; for full specs
                  </p>
                </div>
              </div>
            </div>

          </div>
        </div>

      </div>
    </section>
  );
};
