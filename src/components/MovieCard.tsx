import React from 'react';
import { Info, Play } from 'lucide-react';
import { Movie } from '../types';
import { MoviePosterArt } from './MoviePosterArt';

interface MovieCardProps {
  movie: Movie;
  onSelect: (movie: Movie) => void;
}

export const MovieCard: React.FC<MovieCardProps> = ({ movie, onSelect }) => {
  return (
    <div
      onClick={() => onSelect(movie)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(movie);
        }
      }}
      className="group relative flex flex-col bg-[#0f0c18] rounded-xl overflow-hidden border border-purple-950/40 hover:border-purple-600/60 transition-all duration-300 hover:shadow-xl hover:shadow-purple-950/40 hover:-translate-y-1 cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
    >
      {/* Poster Media Area */}
      <div className="relative w-full aspect-[3/4] overflow-hidden bg-black/60">
        <MoviePosterArt
          movie={movie}
          variant="poster"
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />

        {/* Hover overlay with quick Details button */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#08070d] via-[#08070d]/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSelect(movie);
            }}
            className="w-full py-2.5 px-3 rounded-lg bg-gradient-to-r from-purple-600 to-violet-700 hover:from-purple-500 hover:to-violet-600 text-white font-medium text-xs shadow-lg shadow-purple-950/80 flex items-center justify-center gap-1.5 transition-all"
          >
            <Info className="w-3.5 h-3.5" />
            <span>View Details</span>
          </button>
        </div>

        {/* Format Tag in Top-Right Corner */}
        <div className="absolute top-2.5 right-2.5">
          <span className="px-2 py-0.5 rounded text-[10px] font-mono tracking-wider bg-black/75 backdrop-blur-md border border-purple-900/40 text-purple-200">
            {movie.resolution}
          </span>
        </div>
      </div>

      {/* Card Info Area */}
      <div className="p-3.5 sm:p-4 flex flex-col flex-1 justify-between bg-[#0e0b16]">
        <div>
          {/* Metadata: Genre & Year (Unboxed with typographic separator) */}
          <div className="flex items-center gap-1.5 text-xs text-zinc-400 mb-1.5 font-medium">
            <span className="text-purple-400 truncate max-w-[140px]">{movie.genres[0]}</span>
            <span aria-hidden="true" className="text-zinc-600">·</span>
            <span className="font-mono text-zinc-400">{movie.year}</span>
            <span aria-hidden="true" className="text-zinc-600">·</span>
            <span className="text-zinc-400 text-[11px]">{movie.rating}</span>
          </div>

          {/* Title */}
          <h3 className="font-['Outfit'] font-bold text-white text-base sm:text-lg tracking-tight line-clamp-1 group-hover:text-purple-300 transition-colors">
            {movie.title}
          </h3>
        </div>

        {/* Price / Access Label */}
        <div className="pt-3 mt-2 border-t border-purple-950/40 flex items-center justify-between text-xs">
          <span className="text-zinc-400 font-medium">Access</span>
          <span className="text-purple-300 font-medium tabular-nums">
            {movie.accessLabel}
          </span>
        </div>
      </div>
    </div>
  );
};
