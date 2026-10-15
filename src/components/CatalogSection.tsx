import React, { useMemo } from 'react';
import { Search, SlidersHorizontal, ArrowUpDown, Film, RotateCcw, Sparkles } from 'lucide-react';
import { Movie, SortOption } from '../types';
import { GENRES } from '../data/movies';
import { MovieCard } from './MovieCard';

interface CatalogSectionProps {
  movies: Movie[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedGenre: string;
  onSelectGenre: (genre: string) => void;
  sortBy: SortOption;
  onSortChange: (sort: SortOption) => void;
  onSelectMovie: (movie: Movie) => void;
}

export const CatalogSection: React.FC<CatalogSectionProps> = ({
  movies,
  searchQuery,
  onSearchChange,
  selectedGenre,
  onSelectGenre,
  sortBy,
  onSortChange,
  onSelectMovie,
}) => {
  // Filter and sort movies client-side
  const filteredAndSortedMovies = useMemo(() => {
    return movies
      .filter((movie) => {
        // Search filter (title, synopsis, director, or cast)
        const query = searchQuery.trim().toLowerCase();
        const matchesQuery =
          query === '' ||
          movie.title.toLowerCase().includes(query) ||
          movie.synopsis.toLowerCase().includes(query) ||
          movie.director.toLowerCase().includes(query) ||
          movie.cast.some((actor) => actor.toLowerCase().includes(query));

        // Genre filter
        const matchesGenre =
          selectedGenre === 'All' || movie.genres.includes(selectedGenre);

        return matchesQuery && matchesGenre;
      })
      .sort((a, b) => {
        if (sortBy === 'latest') return b.year - a.year;
        if (sortBy === 'oldest') return a.year - b.year;
        if (sortBy === 'title-asc') return a.title.localeCompare(b.title);
        if (sortBy === 'title-desc') return b.title.localeCompare(a.title);
        return 0;
      });
  }, [movies, searchQuery, selectedGenre, sortBy]);

  const handleResetFilters = () => {
    onSearchChange('');
    onSelectGenre('All');
    onSortChange('latest');
  };

  const isFiltered = searchQuery.trim() !== '' || selectedGenre !== 'All';

  return (
    <section id="catalog" className="w-full py-12 lg:py-16 bg-[#08070d]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-purple-400 mb-1.5">
              <Film className="w-4 h-4" />
              <span>FlixVault Catalog</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight font-['Outfit']">
              Featured Titles & Curated Premieres
            </h2>
            <p className="text-xs sm:text-sm text-zinc-400 mt-1">
              Browse cinematic master releases ready for streaming and rental.
            </p>
          </div>

          {/* Results count & sample data notice */}
          <div className="flex items-center gap-2 text-xs text-zinc-400 font-mono">
            <span>{filteredAndSortedMovies.length} titles available</span>
            <span className="text-zinc-600">·</span>
            <span className="text-purple-400/80">Sample Catalog Mode</span>
          </div>
        </div>

        {/* Search, Filter Bar, and Sort Controls */}
        <div id="categories" className="space-y-4 mb-8">
          
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
            {/* Search Input Bar */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search by title, director, or cast..."
                className="w-full pl-10 pr-10 py-2.5 bg-[#120e1e] border border-purple-950/60 focus:border-purple-500 rounded-xl text-sm text-white placeholder-zinc-500 focus:outline-none transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => onSearchChange('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400 hover:text-white px-1.5 py-0.5 rounded bg-zinc-800"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Sort Dropdown */}
            <div className="flex items-center gap-2 self-end md:self-auto shrink-0">
              <label htmlFor="sort-select" className="text-xs text-zinc-400 flex items-center gap-1.5">
                <ArrowUpDown className="w-3.5 h-3.5 text-purple-400" />
                <span>Sort:</span>
              </label>
              <select
                id="sort-select"
                value={sortBy}
                onChange={(e) => onSortChange(e.target.value as SortOption)}
                className="bg-[#120e1e] border border-purple-950/60 text-zinc-200 text-xs sm:text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-purple-500 cursor-pointer"
              >
                <option value="latest">Latest Releases (Newest)</option>
                <option value="oldest">Classic Releases (Oldest)</option>
                <option value="title-asc">Title (A to Z)</option>
                <option value="title-desc">Title (Z to A)</option>
              </select>
            </div>
          </div>

          {/* Genre Filter Buttons */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-none pt-1">
            {GENRES.map((genre) => {
              const isSelected = selectedGenre === genre;
              return (
                <button
                  key={genre}
                  onClick={() => onSelectGenre(genre)}
                  className={`px-3.5 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap shrink-0 transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-purple-600 text-white shadow-md shadow-purple-950 font-semibold ring-1 ring-purple-400/40'
                      : 'bg-[#120e1e] text-zinc-400 hover:text-white hover:bg-purple-950/40 border border-purple-950/30'
                  }`}
                >
                  {genre}
                </button>
              );
            })}
          </div>

        </div>

        {/* Movie Poster Grid or Friendly Empty State */}
        {filteredAndSortedMovies.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
            {filteredAndSortedMovies.map((movie) => (
              <MovieCard
                key={movie.id}
                movie={movie}
                onSelect={onSelectMovie}
              />
            ))}
          </div>
        ) : (
          /* Friendly Empty State */
          <div className="py-16 px-4 text-center rounded-2xl border border-purple-950/40 bg-[#0d0a16] max-w-xl mx-auto my-6">
            <div className="w-14 h-14 rounded-full bg-purple-950/60 border border-purple-800/40 flex items-center justify-center mx-auto mb-4 text-purple-400">
              <Search className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2 font-['Outfit']">
              No Movies Found
            </h3>
            <p className="text-sm text-zinc-400 max-w-sm mx-auto mb-6">
              We couldn&rsquo;t find any titles matching your current search or genre filter. Try adjusting your search term.
            </p>
            {isFiltered && (
              <button
                onClick={handleResetFilters}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset All Filters</span>
              </button>
            )}
          </div>
        )}

      </div>
    </section>
  );
};
