import React from 'react';
import { Movie } from '../types';

interface MoviePosterArtProps {
  movie: Movie;
  variant?: 'poster' | 'backdrop' | 'compact';
  className?: string;
  showTitleOverlay?: boolean;
}

export const MoviePosterArt: React.FC<MoviePosterArtProps> = ({
  movie,
  variant = 'poster',
  className = '',
  showTitleOverlay = false,
}) => {
  const { artwork, title, year, genres, customPosterUrl } = movie;
  const [imgError, setImgError] = React.useState(false);
  const isWide = variant === 'backdrop';

  const posterSrc =
    customPosterUrl ||
    (movie.posterStorageId ? `/api/posters/${movie.posterStorageId}` : undefined);

  React.useEffect(() => {
    setImgError(false);
  }, [posterSrc]);

  // If movie has a custom poster URL/storage reference and hasn't errored out, render the real uploaded image
  if (posterSrc && !imgError) {
    return (
      <div
        className={`relative w-full overflow-hidden select-none bg-[#09080e] ${
          isWide ? 'aspect-[16/9]' : 'aspect-[3/4]'
        } ${className}`}
      >
        <img
          src={posterSrc}
          alt={`${title} movie poster`}
          className="absolute inset-0 w-full h-full object-cover object-center"
          loading="lazy"
          onError={() => setImgError(true)}
        />
        {/* Subtle cinematic gradient vignette over real poster for seamless FlixVault aesthetic */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#08070d]/85 via-transparent to-transparent pointer-events-none" />

        {/* Studio stamp and resolution badge */}
        <div className="absolute top-2.5 left-3 right-3 flex items-center justify-between text-[9px] sm:text-[10px] font-semibold text-zinc-300 pointer-events-none drop-shadow">
          <span className="font-['Outfit'] tracking-[2px] opacity-90">FLIXVAULT CINEMA</span>
          <span className="font-mono tracking-wider opacity-85">{movie.resolution}</span>
        </div>

        {/* Standalone poster footer info */}
        {!isWide && (
          <div className="absolute bottom-2.5 left-3 right-3 pointer-events-none drop-shadow">
            <p className="text-[9px] uppercase tracking-wider font-semibold text-purple-300">
              {genres.slice(0, 2).join(' · ')}
            </p>
            <p className="text-base font-bold text-white font-['Outfit'] truncate">
              {title}
            </p>
            <p className="text-[9px] text-zinc-400 font-mono">
              {year} · {movie.duration} · {movie.rating}
            </p>
          </div>
        )}

        {/* Optional HTML overlay if requested */}
        {showTitleOverlay && isWide && (
          <div className="absolute inset-0 bg-gradient-to-t from-[#08070d] via-[#08070d]/50 to-transparent flex flex-col justify-end p-6 md:p-12">
            <div className="flex items-center gap-2 text-xs md:text-sm text-purple-400 font-medium mb-2">
              <span>{movie.genres.join(' · ')}</span>
              <span>·</span>
              <span>{movie.year}</span>
              <span>·</span>
              <span className="text-zinc-400">{movie.duration}</span>
            </div>
            <h2 className="text-3xl md:text-5xl font-extrabold text-white tracking-tight mb-3">
              {movie.title}
            </h2>
            <p className="text-sm md:text-base text-zinc-300 max-w-2xl line-clamp-2 md:line-clamp-3 mb-6">
              {movie.synopsis}
            </p>
          </div>
        )}
      </div>
    );
  }

  // Visual configuration based on motif
  const renderMotifGraphics = () => {
    switch (artwork.motif) {
      case 'nebula':
        return (
          <>
            <circle cx="150" cy="180" r="140" fill="url(#nebula-glow)" filter="blur(30px)" opacity="0.6" />
            <circle cx="280" cy="120" r="90" fill="#a855f7" filter="blur(45px)" opacity="0.4" />
            <ellipse cx="200" cy="240" rx="130" ry="2" fill="#c084fc" opacity="0.6" transform="rotate(-15 200 240)" />
            {/* Geometric orbital rings */}
            <circle cx="200" cy="240" r="90" fill="none" stroke="#e9d5ff" strokeWidth="0.8" strokeDasharray="3 4" opacity="0.4" />
            <circle cx="200" cy="240" r="125" fill="none" stroke="#a855f7" strokeWidth="1" opacity="0.3" />
            {/* Distant celestial body */}
            <circle cx="200" cy="240" r="38" fill="#09080e" stroke="#c084fc" strokeWidth="1.5" />
            <path d="M 120 220 Q 200 260 280 220" fill="none" stroke="#f3e8ff" strokeWidth="1.5" opacity="0.5" />
          </>
        );
      case 'cyberpunk':
        return (
          <>
            {/* Skyscraper silhouettes */}
            <rect x="40" y="160" width="45" height="240" fill="#0d0a17" opacity="0.9" />
            <rect x="95" y="120" width="60" height="280" fill="#120d22" opacity="0.95" />
            <rect x="165" y="90" width="70" height="310" fill="#07050c" />
            <rect x="245" y="140" width="50" height="260" fill="#150f28" opacity="0.9" />
            <rect x="305" y="170" width="55" height="230" fill="#0a0714" opacity="0.85" />
            {/* Neon light streaks */}
            <line x1="100" y1="130" x2="100" y2="340" stroke="#e879f9" strokeWidth="2" opacity="0.7" />
            <line x1="200" y1="100" x2="200" y2="360" stroke="#8b5cf6" strokeWidth="3" opacity="0.8" />
            <line x1="260" y1="150" x2="260" y2="350" stroke="#f43f5e" strokeWidth="1.5" opacity="0.6" />
            {/* Cyber grid floor */}
            <path d="M 0 350 L 400 350 M 0 370 L 400 370 M 0 390 L 400 390" stroke="#7c3aed" strokeWidth="0.8" opacity="0.35" />
            <path d="M 200 340 L 40 400 M 200 340 L 120 400 M 200 340 L 280 400 M 200 340 L 360 400" stroke="#7c3aed" strokeWidth="0.8" opacity="0.35" />
            {/* Volumetric neon glow */}
            <circle cx="200" cy="180" r="100" fill="#d946ef" filter="blur(60px)" opacity="0.25" />
          </>
        );
      case 'noir':
        return (
          <>
            {/* Chiaroscuro venetian blinds / dramatic diagonal shadow lines */}
            <path d="M -50 0 L 250 400 L 210 400 L -90 0 Z" fill="#ffffff" opacity="0.04" />
            <path d="M 30 0 L 330 400 L 290 400 L -10 0 Z" fill="#ffffff" opacity="0.05" />
            <path d="M 110 0 L 410 400 L 370 400 L 70 0 Z" fill="#ffffff" opacity="0.04" />
            {/* Silhouette figure */}
            <ellipse cx="200" cy="275" rx="22" ry="18" fill="#040306" />
            <path d="M 160 380 Q 200 290 240 380 Z" fill="#040306" />
            {/* Street lamp glow */}
            <circle cx="120" cy="140" r="70" fill="#c084fc" filter="blur(40px)" opacity="0.3" />
            <circle cx="120" cy="140" r="8" fill="#f5f3ff" opacity="0.8" />
          </>
        );
      case 'deepsea':
        return (
          <>
            {/* Abyss sonar rings and benthic light */}
            <circle cx="200" cy="200" r="50" fill="none" stroke="#818cf8" strokeWidth="1.2" opacity="0.6" />
            <circle cx="200" cy="200" r="90" fill="none" stroke="#6366f1" strokeWidth="1" strokeDasharray="4 6" opacity="0.4" />
            <circle cx="200" cy="200" r="140" fill="none" stroke="#4f46e5" strokeWidth="0.8" opacity="0.25" />
            {/* Deep bioluminescent bloom */}
            <circle cx="200" cy="200" r="75" fill="#6366f1" filter="blur(40px)" opacity="0.35" />
            {/* Submersible light cone */}
            <polygon points="200,200 40,400 360,400" fill="#818cf8" opacity="0.08" />
          </>
        );
      case 'solaris':
        return (
          <>
            {/* Huge glowing solar flare / planetary curve */}
            <circle cx="200" cy="380" r="230" fill="#090712" stroke="#e879f9" strokeWidth="2" />
            <circle cx="200" cy="380" r="235" fill="none" stroke="#c084fc" strokeWidth="1" opacity="0.4" />
            <circle cx="200" cy="180" r="120" fill="#a855f7" filter="blur(55px)" opacity="0.35" />
            {/* Solar coronal rays */}
            <line x1="200" y1="150" x2="200" y2="40" stroke="#f472b6" strokeWidth="1.5" opacity="0.7" />
            <line x1="130" y1="170" x2="60" y2="80" stroke="#c084fc" strokeWidth="1.2" opacity="0.5" />
            <line x1="270" y1="170" x2="340" y2="80" stroke="#c084fc" strokeWidth="1.2" opacity="0.5" />
          </>
        );
      case 'monolith':
        return (
          <>
            {/* Obsidian Monolith */}
            <polygon points="175,100 225,100 235,320 165,320" fill="#050408" stroke="#a855f7" strokeWidth="1" />
            <line x1="200" y1="100" x2="200" y2="320" stroke="#d8b4fe" strokeWidth="1.5" opacity="0.7" />
            {/* Monolith aura */}
            <circle cx="200" cy="200" r="90" fill="#7c3aed" filter="blur(50px)" opacity="0.3" />
            {/* Arctic horizon line */}
            <line x1="0" y1="320" x2="400" y2="320" stroke="#4c1d95" strokeWidth="1" opacity="0.5" />
          </>
        );
      case 'quantum':
        return (
          <>
            {/* Geometric quantum particle tracks */}
            <circle cx="200" cy="200" r="110" fill="none" stroke="#8b5cf6" strokeWidth="1" strokeDasharray="6 8" opacity="0.5" />
            <ellipse cx="200" cy="200" rx="140" ry="50" fill="none" stroke="#c084fc" strokeWidth="1.2" opacity="0.4" transform="rotate(30 200 200)" />
            <ellipse cx="200" cy="200" rx="140" ry="50" fill="none" stroke="#a78bfa" strokeWidth="1.2" opacity="0.4" transform="rotate(-30 200 200)" />
            <circle cx="200" cy="200" r="30" fill="#7c3aed" filter="blur(25px)" opacity="0.8" />
            <circle cx="200" cy="200" r="8" fill="#ffffff" opacity="0.9" />
          </>
        );
      case 'archive':
      default:
        return (
          <>
            {/* CRT Scanlines / Audio waveform pattern */}
            <path d="M 40 220 Q 80 160 120 220 T 200 220 T 280 220 T 360 220" fill="none" stroke="#a855f7" strokeWidth="1.8" opacity="0.6" />
            <path d="M 40 240 Q 80 280 120 240 T 200 240 T 280 240 T 360 240" fill="none" stroke="#c084fc" strokeWidth="1.2" opacity="0.4" />
            <circle cx="200" cy="220" r="80" fill="#581c87" filter="blur(45px)" opacity="0.4" />
            {/* Micro tape spool markers */}
            <circle cx="140" cy="220" r="18" fill="none" stroke="#e9d5ff" strokeWidth="1" opacity="0.7" />
            <circle cx="260" cy="220" r="18" fill="none" stroke="#e9d5ff" strokeWidth="1" opacity="0.7" />
          </>
        );
    }
  };

  return (
    <div
      className={`relative w-full overflow-hidden select-none bg-[#09080e] ${
        isWide ? 'aspect-[16/9]' : 'aspect-[3/4]'
      } ${className}`}
    >
      {/* SVG Canvas for cinematic graphic composition */}
      <svg
        viewBox={isWide ? '0 0 800 450' : '0 0 400 533'}
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 w-full h-full"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label={`${title} cinematic key art poster`}
      >
        <defs>
          <radialGradient id="nebula-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={artwork.glowColor} stopOpacity="0.8" />
            <stop offset="60%" stopColor={artwork.accentColor} stopOpacity="0.3" />
            <stop offset="100%" stopColor="#08070d" stopOpacity="0" />
          </radialGradient>

          <linearGradient id="vignette-overlay" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#08070d" stopOpacity="0.3" />
            <stop offset="50%" stopColor="#08070d" stopOpacity="0.1" />
            <stop offset="85%" stopColor="#08070d" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#08070d" stopOpacity="0.98" />
          </linearGradient>

          {/* Film Grain Texture Filter */}
          <filter id="grain">
            <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" result="noise" />
            <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.07 0" />
            <feComposite in2="SourceGraphic" in="glare" operator="in" />
          </filter>
        </defs>

        {/* Deep dark cinematic background */}
        <rect width="100%" height="100%" fill="#0a0812" />

        {/* Ambient atmospheric color fields */}
        <circle
          cx={isWide ? '550' : '220'}
          cy={isWide ? '220' : '230'}
          r={isWide ? '280' : '180'}
          fill={artwork.glowColor}
          filter="blur(70px)"
          opacity="0.22"
        />
        <circle
          cx={isWide ? '250' : '100'}
          cy={isWide ? '160' : '140'}
          r={isWide ? '200' : '130'}
          fill="#3b0764"
          filter="blur(60px)"
          opacity="0.35"
        />

        {/* Thematic graphical layer */}
        <g transform={isWide ? 'translate(200, 10) scale(1.1)' : 'translate(0, 30)'}>
          {renderMotifGraphics()}
        </g>

        {/* Cinematic Film Vignette & Shadow Scrim */}
        <rect width="100%" height="100%" fill="url(#vignette-overlay)" />

        {/* High-end Film Poster Lettering Elements inside SVG */}
        <g opacity="0.9">
          {/* Subtle cinematic studio stamp at top */}
          <text
            x={isWide ? '60' : '28'}
            y={isWide ? '45' : '38'}
            fill="#a1a1aa"
            fontSize={isWide ? '11' : '9'}
            letterSpacing="3"
            fontWeight="600"
            fontFamily="'Outfit', sans-serif"
          >
            FLIXVAULT CINEMA
          </text>
          <text
            x={isWide ? '740' : '372'}
            y={isWide ? '45' : '38'}
            textAnchor="end"
            fill="#a1a1aa"
            fontSize={isWide ? '11' : '9'}
            letterSpacing="2"
            fontWeight="500"
            fontFamily="'Plus Jakarta Sans', sans-serif"
          >
            {movie.resolution}
          </text>
        </g>

        {/* Poster Title Treatment (for variant=poster when standalone) */}
        {!isWide && (
          <g>
            {/* Genre teaser kicker */}
            <text
              x="28"
              y="440"
              fill={artwork.accentColor}
              fontSize="10"
              letterSpacing="2"
              fontWeight="600"
              fontFamily="'Plus Jakarta Sans', sans-serif"
            >
              {genres.slice(0, 2).join(' · ').toUpperCase()}
            </text>

            {/* Title */}
            <text
              x="28"
              y="472"
              fill="#ffffff"
              fontSize="24"
              fontWeight="800"
              fontFamily="'Outfit', sans-serif"
              letterSpacing="-0.5"
            >
              {title}
            </text>

            {/* Release year and metadata separator */}
            <text
              x="28"
              y="496"
              fill="#a1a1aa"
              fontSize="10"
              letterSpacing="1"
              fontFamily="'Plus Jakarta Sans', sans-serif"
            >
              {year} · {movie.duration} · {movie.rating}
            </text>
          </g>
        )}
      </svg>

      {/* Optional HTML overlay if requested */}
      {showTitleOverlay && isWide && (
        <div className="absolute inset-0 bg-gradient-to-t from-[#08070d] via-[#08070d]/40 to-transparent flex flex-col justify-end p-6 md:p-12">
          <div className="flex items-center gap-2 text-xs md:text-sm text-purple-400 font-medium mb-2">
            <span>{movie.genres.join(' · ')}</span>
            <span>·</span>
            <span>{movie.year}</span>
            <span>·</span>
            <span className="text-zinc-400">{movie.duration}</span>
          </div>
          <h2 className="text-3xl md:text-5xl font-extrabold text-white tracking-tight mb-3">
            {movie.title}
          </h2>
          <p className="text-sm md:text-base text-zinc-300 max-w-2xl line-clamp-2 md:line-clamp-3 mb-6">
            {movie.synopsis}
          </p>
        </div>
      )}
    </div>
  );
};
