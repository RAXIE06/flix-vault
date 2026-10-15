import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Film,
  Sparkles,
  Upload,
  Image as ImageIcon,
  Check,
  AlertCircle,
  Eye,
  Trash2,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import { Movie } from '../../types';
import { GENRES } from '../../data/movies';
import { MoviePosterArt } from '../MoviePosterArt';
import { api } from '../../services/api';

interface MovieEditModalProps {
  isOpen: boolean;
  movie: Movie | null; // null = Add Mode, Movie = Edit Mode
  onSave: (movie: Movie) => void;
  onClose: () => void;
}

export const MovieEditModal: React.FC<MovieEditModalProps> = ({
  isOpen,
  movie,
  onSave,
  onClose,
}) => {
  const isEditing = !!movie;
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form State
  const [title, setTitle] = useState('');
  const [tagline, setTagline] = useState('');
  const [synopsis, setSynopsis] = useState('');
  const [year, setYear] = useState<number>(2025);
  const [duration, setDuration] = useState('2h 10m');
  const [rating, setRating] = useState('PG-13');
  const [selectedGenres, setSelectedGenres] = useState<string[]>(['Sci-Fi']);
  const [priceSample, setPriceSample] = useState('₹149');
  const [director, setDirector] = useState('');
  const [cast, setCast] = useState('');
  const [resolution, setResolution] = useState<'4K IMAX' | '4K HDR' | '1080p HD'>('4K IMAX');
  const [audio, setAudio] = useState<'Dolby Atmos' | '5.1 Surround'>('Dolby Atmos');
  const [motif, setMotif] = useState<Movie['artwork']['motif']>('nebula');
  const [telegramChannelId, setTelegramChannelId] = useState('');
  const [isFeatured, setIsFeatured] = useState(false);
  const [isEnabled, setIsEnabled] = useState(true);

  // Poster Upload & MongoDB Storage State
  const [customPosterUrl, setCustomPosterUrl] = useState('');
  const [posterStorageId, setPosterStorageId] = useState('');
  const [selectedPosterFile, setSelectedPosterFile] = useState<File | null>(null);
  const [posterPreviewUrl, setPosterPreviewUrl] = useState('');
  const [posterFileDetails, setPosterFileDetails] = useState<{ name: string; size: string } | null>(null);
  const [isUploadingPoster, setIsUploadingPoster] = useState(false);
  const [posterError, setPosterError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Initialize or reset form when movie changes
  useEffect(() => {
    if (movie) {
      setTitle(movie.title);
      setTagline(movie.tagline || '');
      setSynopsis(movie.synopsis);
      setYear(movie.year);
      setDuration(movie.duration);
      setRating(movie.rating);
      setSelectedGenres(movie.genres);
      setPriceSample(movie.priceSample);
      setDirector(movie.director);
      setCast(movie.cast.join(', '));
      setResolution(movie.resolution);
      setAudio(movie.audio);
      setMotif(movie.artwork.motif);
      setTelegramChannelId(movie.telegramChannelId || '');
      setIsFeatured(!!movie.isFeatured);
      setIsEnabled(movie.isEnabled !== false);

      // Existing poster state
      setCustomPosterUrl(movie.customPosterUrl || '');
      setPosterStorageId(movie.posterStorageId || '');
      setPosterPreviewUrl(movie.customPosterUrl || '');
      setSelectedPosterFile(null);
      if (movie.customPosterUrl) {
        setPosterFileDetails({
          name: `${movie.title} Poster`,
          size: movie.posterSize ? `${(movie.posterSize / 1024).toFixed(1)} KB` : 'MongoDB GridFS',
        });
      } else {
        setPosterFileDetails(null);
      }
    } else {
      // Defaults for new movie
      setTitle('');
      setTagline('');
      setSynopsis('');
      setYear(2025);
      setDuration('2h 00m');
      setRating('PG-13');
      setSelectedGenres(['Sci-Fi', 'Mystery']);
      setPriceSample('₹149');
      setDirector('Elena Vance');
      setCast('Lead Actor, Supporting Actor');
      setResolution('4K IMAX');
      setAudio('Dolby Atmos');
      setMotif('nebula');
      setTelegramChannelId('@flixvault_vip_channel');
      setIsFeatured(false);
      setIsEnabled(true);

      // Poster state reset
      setCustomPosterUrl('');
      setPosterStorageId('');
      setPosterPreviewUrl('');
      setSelectedPosterFile(null);
      setPosterFileDetails(null);
    }
    setPosterError(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [movie, isOpen]);

  if (!isOpen) return null;

  const handleGenreToggle = (genre: string) => {
    if (genre === 'All') return;
    if (selectedGenres.includes(genre)) {
      if (selectedGenres.length > 1) {
        setSelectedGenres(selectedGenres.filter((g) => g !== genre));
      }
    } else {
      setSelectedGenres([...selectedGenres, genre]);
    }
  };

  /**
   * Device Image File Selection & Client Validation
   */
  const handlePosterFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate size: 5MB max
    if (file.size > 5 * 1024 * 1024) {
      setPosterError(
        `File is too large (${(file.size / (1024 * 1024)).toFixed(2)} MB). Maximum allowed size is 5MB.`
      );
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // Validate format: JPEG, PNG, WEBP, GIF, SVG
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];
    if (!allowed.includes(file.type.toLowerCase())) {
      setPosterError('Invalid file type. Please upload a JPG, PNG, WEBP, GIF, or SVG image.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setPosterError(null);
    setSelectedPosterFile(file);

    const localUrl = URL.createObjectURL(file);
    setPosterPreviewUrl(localUrl);
    setCustomPosterUrl(localUrl);
    setPosterFileDetails({
      name: file.name,
      size: `${(file.size / 1024).toFixed(1)} KB`,
    });
  };

  const handleReplacePosterClick = () => {
    fileInputRef.current?.click();
  };

  const handleRemovePosterClick = async () => {
    setSelectedPosterFile(null);
    setPosterPreviewUrl('');
    setCustomPosterUrl('');
    setPosterStorageId('');
    setPosterFileDetails(null);
    setPosterError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';

    // If editing a movie with a saved poster in GridFS, call removal endpoint
    if (movie?.id && (movie.posterStorageId || movie.customPosterUrl?.startsWith('/api/'))) {
      try {
        await api.removeMoviePoster(movie.id);
      } catch (err) {
        console.warn('Poster server cleanup will be finalized on save:', err);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Movie title is required.');
      return;
    }
    if (!synopsis.trim()) {
      setError('Description is required.');
      return;
    }
    if (!priceSample.trim()) {
      setError('Price is required.');
      return;
    }

    let finalPosterStorageId = posterStorageId;
    let finalCustomPosterUrl = customPosterUrl;
    let finalPosterContentType = movie?.posterContentType;
    let finalPosterSize = movie?.posterSize;

    // If a new poster was selected from the device, upload directly to MongoDB GridFS!
    if (selectedPosterFile) {
      try {
        setIsUploadingPoster(true);
        setPosterError(null);

        const uploadRes = await api.uploadPoster(selectedPosterFile);
        finalPosterStorageId = uploadRes.fileId;
        finalCustomPosterUrl = uploadRes.posterUrl;
        finalPosterContentType = uploadRes.contentType;
        finalPosterSize = uploadRes.size;
      } catch (uploadErr: any) {
        setIsUploadingPoster(false);
        setPosterError(`Upload failed: ${uploadErr.message || 'Could not store poster in MongoDB GridFS.'}`);
        return;
      } finally {
        setIsUploadingPoster(false);
      }
    } else if (!posterPreviewUrl) {
      // User explicitly removed the poster
      finalPosterStorageId = '';
      finalCustomPosterUrl = '';
      finalPosterContentType = '';
      finalPosterSize = 0;
    }

    const motifColors: Record<
      Movie['artwork']['motif'],
      { bgGradient: string; glowColor: string; accentColor: string }
    > = {
      nebula: {
        bgGradient: 'from-violet-950 via-purple-900 to-black',
        glowColor: '#a855f7',
        accentColor: '#c084fc',
      },
      cyberpunk: {
        bgGradient: 'from-fuchsia-950 via-purple-900 to-black',
        glowColor: '#e879f9',
        accentColor: '#f43f5e',
      },
      noir: {
        bgGradient: 'from-slate-950 via-purple-950 to-black',
        glowColor: '#9333ea',
        accentColor: '#a855f7',
      },
      solaris: {
        bgGradient: 'from-amber-950 via-purple-950 to-black',
        glowColor: '#c084fc',
        accentColor: '#e879f9',
      },
      deepsea: {
        bgGradient: 'from-indigo-950 via-violet-950 to-black',
        glowColor: '#6366f1',
        accentColor: '#818cf8',
      },
      monolith: {
        bgGradient: 'from-purple-950 via-slate-950 to-black',
        glowColor: '#9333ea',
        accentColor: '#d8b4fe',
      },
      quantum: {
        bgGradient: 'from-violet-950 via-indigo-950 to-black',
        glowColor: '#8b5cf6',
        accentColor: '#a78bfa',
      },
      archive: {
        bgGradient: 'from-neutral-950 via-purple-950 to-black',
        glowColor: '#a855f7',
        accentColor: '#e9d5ff',
      },
    };

    const formattedPrice = priceSample.startsWith('₹')
      ? priceSample.trim()
      : `₹${priceSample.replace(/^[$₹]\s*/, '').trim()}`;
    const numericPrice = parseFloat(formattedPrice.replace(/[^0-9.]/g, '')) || 149;

    const savedMovie: Movie = {
      id: movie ? movie.id : `mv-${Date.now().toString().slice(-4)}`,
      title: title.trim(),
      tagline: tagline.trim(),
      synopsis: synopsis.trim(),
      year: Number(year) || 2025,
      duration: duration.trim() || '2h 00m',
      rating,
      genres: selectedGenres,
      priceSample: formattedPrice,
      priceNumeric: numericPrice,
      accessType: 'pay_per_movie',
      accessLabel: `Pay per Movie · ${formattedPrice}`,
      resolution,
      audio,
      director: director.trim() || 'Director',
      cast: cast.split(',').map((c) => c.trim()).filter(Boolean),
      isFeatured,
      isEnabled,
      telegramChannelId: telegramChannelId.trim(),
      customPosterUrl: finalCustomPosterUrl.trim() || undefined,
      posterStorageId: finalPosterStorageId || undefined,
      posterContentType: finalPosterContentType || undefined,
      posterSize: finalPosterSize || undefined,
      artwork: {
        bgGradient: motifColors[motif].bgGradient,
        glowColor: motifColors[motif].glowColor,
        accentColor: motifColors[motif].accentColor,
        motif,
      },
    };

    onSave(savedMovie);
    onClose();
  };

  // Mock movie object for real-time live artwork & poster preview
  const previewMovie: Movie = {
    id: 'preview-id',
    title: title || 'Movie Title',
    year: Number(year) || 2025,
    genres: selectedGenres,
    duration: duration || '2h 15m',
    rating,
    director: director || 'Director Name',
    cast: ['Lead Actor'],
    synopsis: synopsis || 'Short movie description...',
    tagline: tagline || 'Compelling tagline',
    priceSample: priceSample || '₹149',
    accessType: 'pay_per_movie',
    accessLabel: `Pay per Movie · ${priceSample || '₹149'}`,
    resolution,
    audio,
    customPosterUrl: posterPreviewUrl || customPosterUrl || undefined,
    artwork: {
      bgGradient: 'from-violet-950 to-black',
      glowColor: '#a855f7',
      accentColor: '#c084fc',
      motif,
    },
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-4xl bg-[#0d0917] border border-purple-900/60 rounded-2xl overflow-hidden shadow-2xl shadow-purple-950/80 my-auto text-left max-h-[92vh] flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="movie-edit-title"
      >
        {/* Header */}
        <div className="px-6 py-4 bg-[#120c22] border-b border-purple-950/60 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-600 to-violet-800 flex items-center justify-center text-white">
              <Film className="w-4 h-4" />
            </div>
            <div>
              <h2 id="movie-edit-title" className="text-lg font-bold text-white font-['Outfit']">
                {isEditing ? `Edit: ${movie.title}` : 'Add New Movie to Showcase'}
              </h2>
              <p className="text-[11px] text-zinc-400">
                Configure storefront presentation, MongoDB poster image, pricing, and Telegram delivery
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-purple-950/50 transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6 flex-1">
          {error && (
            <div className="p-3 bg-red-950/50 border border-red-800/60 rounded-xl text-xs text-red-200 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            {/* Left Core Movie Metadata Column */}
            <div className="md:col-span-7 space-y-4">
              {/* Title */}
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">
                  Movie Title <span className="text-purple-400">*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Chronos: The Final Paradox"
                  className="w-full px-3.5 py-2.5 bg-[#140f24] border border-purple-950/70 focus:border-purple-500 rounded-xl text-sm text-white placeholder-zinc-500 focus:outline-none"
                  required
                />
              </div>

              {/* Tagline */}
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">
                  Tagline / Hook (Optional)
                </label>
                <input
                  type="text"
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  placeholder="e.g. Time is not a loop. It's a cage."
                  className="w-full px-3.5 py-2 bg-[#140f24] border border-purple-950/70 focus:border-purple-500 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none"
                />
              </div>

              {/* Synopsis */}
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">
                  Synopsis / Description <span className="text-purple-400">*</span>
                </label>
                <textarea
                  value={synopsis}
                  onChange={(e) => setSynopsis(e.target.value)}
                  rows={3}
                  placeholder="Engaging summary of the movie..."
                  className="w-full px-3.5 py-2 bg-[#140f24] border border-purple-950/70 focus:border-purple-500 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none resize-none leading-relaxed"
                  required
                />
              </div>

              {/* Pricing, Year, and Duration */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-purple-300 mb-1">
                    Price (INR) <span className="text-purple-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={priceSample}
                    onChange={(e) => setPriceSample(e.target.value)}
                    placeholder="₹149"
                    className="w-full px-3 py-2 bg-[#140f24] border border-purple-950/70 focus:border-purple-500 rounded-xl text-xs sm:text-sm font-bold text-purple-300 focus:outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1">
                    Release Year
                  </label>
                  <input
                    type="number"
                    value={year}
                    onChange={(e) => setYear(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-[#140f24] border border-purple-950/70 focus:border-purple-500 rounded-xl text-xs sm:text-sm text-white focus:outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1">
                    Duration
                  </label>
                  <input
                    type="text"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    placeholder="2h 15m"
                    className="w-full px-3 py-2 bg-[#140f24] border border-purple-950/70 focus:border-purple-500 rounded-xl text-xs sm:text-sm text-white focus:outline-none"
                  />
                </div>
              </div>

              {/* Director and Rating */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1">
                    Director
                  </label>
                  <input
                    type="text"
                    value={director}
                    onChange={(e) => setDirector(e.target.value)}
                    placeholder="Elena Vance"
                    className="w-full px-3 py-2 bg-[#140f24] border border-purple-950/70 focus:border-purple-500 rounded-xl text-xs text-white focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1">
                    Rating
                  </label>
                  <select
                    value={rating}
                    onChange={(e) => setRating(e.target.value)}
                    className="w-full px-3 py-2 bg-[#140f24] border border-purple-950/70 focus:border-purple-500 rounded-xl text-xs text-white focus:outline-none cursor-pointer"
                  >
                    <option value="PG-13">PG-13</option>
                    <option value="R">R</option>
                    <option value="PG">PG</option>
                    <option value="G">G</option>
                  </select>
                </div>
              </div>

              {/* Cast */}
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">
                  Cast (comma-separated)
                </label>
                <input
                  type="text"
                  value={cast}
                  onChange={(e) => setCast(e.target.value)}
                  placeholder="Alexander Cross, Nadia Chen, Marcus Sterling"
                  className="w-full px-3.5 py-2 bg-[#140f24] border border-purple-950/70 focus:border-purple-500 rounded-xl text-xs text-white focus:outline-none"
                />
              </div>

              {/* Genres Picker */}
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                  Genres (Click to toggle)
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {GENRES.filter((g) => g !== 'All').map((g) => {
                    const isSelected = selectedGenres.includes(g);
                    return (
                      <button
                        type="button"
                        key={g}
                        onClick={() => handleGenreToggle(g)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-purple-600 text-white shadow-sm'
                            : 'bg-[#150f24] text-zinc-400 border border-purple-950/60 hover:text-white'
                        }`}
                      >
                        {g}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Master Formats */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1">
                    Master Resolution
                  </label>
                  <select
                    value={resolution}
                    onChange={(e) => setResolution(e.target.value as any)}
                    className="w-full px-3 py-2 bg-[#140f24] border border-purple-950/70 focus:border-purple-500 rounded-xl text-xs text-white focus:outline-none cursor-pointer"
                  >
                    <option value="4K IMAX">4K IMAX Enhanced</option>
                    <option value="4K HDR">4K HDR10+</option>
                    <option value="1080p HD">1080p Full HD</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1">
                    Master Audio
                  </label>
                  <select
                    value={audio}
                    onChange={(e) => setAudio(e.target.value as any)}
                    className="w-full px-3 py-2 bg-[#140f24] border border-purple-950/70 focus:border-purple-500 rounded-xl text-xs text-white focus:outline-none cursor-pointer"
                  >
                    <option value="Dolby Atmos">Dolby Atmos</option>
                    <option value="5.1 Surround">5.1 Surround</option>
                  </select>
                </div>
              </div>

              {/* Telegram Channel Field */}
              <div className="p-3.5 rounded-xl bg-purple-950/20 border border-purple-900/40 space-y-1.5">
                <label className="block text-xs font-semibold text-purple-300">
                  Associated Telegram VIP Channel ID / Handle
                </label>
                <input
                  type="text"
                  value={telegramChannelId}
                  onChange={(e) => setTelegramChannelId(e.target.value)}
                  placeholder="e.g. @flixvault_vip_chronos or -100192837465"
                  className="w-full px-3 py-2 bg-[#140f24] border border-purple-900/60 focus:border-purple-500 rounded-lg text-xs text-white font-mono placeholder-zinc-500 focus:outline-none"
                />
                <p className="text-[10px] text-zinc-400">
                  Verified buyers receive automated single-use join links to this channel upon UPI payment.
                </p>
              </div>
            </div>

            {/* Right Column: Poster Upload & Live Artwork Preview */}
            <div className="md:col-span-5 space-y-4">
              {/* Visible Poster Upload Section */}
              <div className="p-4 rounded-xl bg-[#140f24] border border-purple-900/50 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ImageIcon className="w-4 h-4 text-purple-400" />
                    <label className="text-xs font-bold text-white tracking-wide">
                      Upload Movie Poster
                    </label>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-950/80 border border-purple-800/40 text-purple-300">
                    MongoDB GridFS
                  </span>
                </div>

                <p className="text-[11px] text-zinc-400 leading-normal">
                  Upload custom high-resolution key art directly into MongoDB GridFS. Max 5MB (JPG, PNG, WEBP, GIF, SVG).
                </p>

                {/* Hidden Real File Input */}
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handlePosterFileChange}
                  accept="image/jpeg,image/jpg,image/png,image/webp,image/gif,image/svg+xml"
                  className="hidden"
                />

                {/* Upload Status / Validation Error */}
                {posterError && (
                  <div className="p-2.5 rounded-lg bg-red-950/60 border border-red-800/70 text-red-200 text-xs flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    <span className="text-[11px] leading-tight">{posterError}</span>
                  </div>
                )}

                {/* Active Poster Controls: Preview & Actions */}
                {posterPreviewUrl || customPosterUrl ? (
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-3 p-2.5 rounded-lg bg-purple-950/30 border border-purple-900/60">
                      <div className="w-12 h-16 rounded overflow-hidden bg-black shrink-0 border border-purple-800/50">
                        <img
                          src={posterPreviewUrl || customPosterUrl}
                          alt="Poster preview thumbnail"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-white truncate">
                          {posterFileDetails?.name || 'Saved Movie Poster'}
                        </p>
                        <p className="text-[10px] text-purple-300 font-mono">
                          {posterFileDetails?.size || 'Stored in MongoDB'}
                        </p>
                        {selectedPosterFile && (
                          <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-950/80 text-amber-300 border border-amber-800/50">
                            Ready to upload on save
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Replace and Remove Buttons */}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleReplacePosterClick}
                        className="flex-1 px-3 py-2 rounded-lg bg-purple-900/40 hover:bg-purple-900/70 border border-purple-700/50 text-purple-200 hover:text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        title="Select a different image file from your device"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Replace Poster</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleRemovePosterClick}
                        className="px-3 py-2 rounded-lg bg-red-950/40 hover:bg-red-900/60 border border-red-800/50 text-red-300 hover:text-red-100 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        title="Remove custom poster and revert to procedural motif"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Remove</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Empty state: Select poster from device */
                  <div>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full p-4 rounded-xl border-2 border-dashed border-purple-800/60 hover:border-purple-500 bg-purple-950/20 hover:bg-purple-950/40 text-purple-300 hover:text-white transition-all flex flex-col items-center justify-center gap-2 cursor-pointer group"
                    >
                      <div className="w-9 h-9 rounded-full bg-purple-900/60 group-hover:bg-purple-800/80 flex items-center justify-center text-purple-200 transition-colors">
                        <Upload className="w-4 h-4" />
                      </div>
                      <span className="text-xs font-bold">Select Poster from Device</span>
                      <span className="text-[10px] text-zinc-400">
                        PNG, JPG, WEBP, or GIF up to 5MB
                      </span>
                    </button>
                  </div>
                )}
              </div>

              {/* Fallback Procedural Motif Selector */}
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">
                  Procedural Artwork Motif (Fallback)
                </label>
                <select
                  value={motif}
                  onChange={(e) => setMotif(e.target.value as any)}
                  className="w-full px-3 py-2 bg-[#140f24] border border-purple-950/70 focus:border-purple-500 rounded-xl text-xs text-white focus:outline-none cursor-pointer mb-2"
                >
                  <option value="nebula">Deep Nebula (Violet/Space)</option>
                  <option value="cyberpunk">Cyberpunk Skyline (Neon Magenta)</option>
                  <option value="noir">Noir Chiaroscuro (Deep Shadows)</option>
                  <option value="solaris">Solaris (Golden Corona)</option>
                  <option value="deepsea">Subsurface Abyss (Bioluminescent)</option>
                  <option value="monolith">Monolith (Geometric Purple)</option>
                  <option value="quantum">Quantum Vanguard (Orbital Particles)</option>
                  <option value="archive">Archive Broadcast (Retro Waveform)</option>
                </select>

                {/* Real-time Miniature Poster Card Preview */}
                <div className="rounded-xl overflow-hidden border border-purple-900/50 aspect-[3/4] bg-black shadow-lg relative">
                  <MoviePosterArt movie={previewMovie} variant="poster" className="w-full h-full object-cover" />
                  {isUploadingPoster && (
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-xs flex flex-col items-center justify-center gap-2 z-10">
                      <Loader2 className="w-6 h-6 text-purple-400 animate-spin" />
                      <span className="text-xs font-semibold text-white">
                        Uploading to MongoDB GridFS...
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Storefront Display Toggles */}
              <div className="p-3.5 rounded-xl bg-[#140f24] border border-purple-950/60 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold text-white block">
                      Published on Storefront
                    </span>
                    <span className="text-[10px] text-zinc-400">
                      Toggle visibility to public customers
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={isEnabled}
                    onChange={(e) => setIsEnabled(e.target.checked)}
                    className="w-4 h-4 accent-purple-600 rounded cursor-pointer"
                  />
                </div>

                <div className="pt-2 border-t border-purple-950/60 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold text-white block">
                      Primary Featured Hero
                    </span>
                    <span className="text-[10px] text-zinc-400">
                      Receives top showcase attention
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={isFeatured}
                    onChange={(e) => setIsFeatured(e.target.checked)}
                    className="w-4 h-4 accent-purple-600 rounded cursor-pointer"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Modal Footer Controls */}
          <div className="pt-4 border-t border-purple-950/60 flex items-center justify-end gap-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={isUploadingPoster}
              className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isUploadingPoster}
              className="px-6 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-violet-700 hover:from-purple-500 hover:to-violet-600 text-white font-semibold text-xs sm:text-sm shadow-md shadow-purple-950 transition-all cursor-pointer flex items-center gap-2 disabled:opacity-50"
            >
              {isUploadingPoster && <Loader2 className="w-4 h-4 animate-spin text-white" />}
              <span>
                {isUploadingPoster
                  ? 'Uploading Poster...'
                  : isEditing
                  ? 'Save Movie Changes'
                  : 'Publish Movie to Catalog'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
