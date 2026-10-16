import { Movie, TelegramConfig } from '../types';

/**
 * FlixVault Curated Premium Showcase
 * Core Business Model: Pay-Per-Movie only (UPI payment).
 * No subscriptions or recurring memberships.
 */
export const CURATED_SHOWCASE_MOVIES: Movie[] = [
  {
    id: 'mv-001',
    title: 'Chronos Horizon',
    year: 2025,
    genres: ['Sci-Fi', 'Mystery'],
    duration: '2h 28m',
    rating: 'U/A 13+',
    director: 'Elena Vance',
    cast: ['Alexander Cross', 'Nadia Chen', 'Marcus Sterling'],
    synopsis: 'A deep-space salvage crew discovers a derelict exploration vessel hovering at the event horizon of an ancient singularity, where temporal distortions begin physically rewriting their reality.',
    tagline: 'Time does not bend. It breaks.',
    priceSample: '₹149',
    priceNumeric: 149,
    accessType: 'pay_per_movie',
    accessLabel: 'Pay per Movie · ₹149',
    resolution: '4K IMAX',
    audio: 'Dolby Atmos',
    languages: ['Hindi', 'English', 'Tamil'],
    posterAspectRatio: '2:3',
    isFeatured: true,
    isEnabled: true,
    telegramChannelId: '@flixvault_vip_chronos',
    artwork: {
      bgGradient: 'from-violet-950 via-purple-900 to-black',
      glowColor: '#a855f7',
      accentColor: '#c084fc',
      motif: 'nebula',
    },
  },
  {
    id: 'mv-002',
    title: 'Neon Syndicate',
    year: 2026,
    genres: ['Cyberpunk', 'Action'],
    duration: '1h 56m',
    rating: 'A',
    director: 'Kaito Takahashi',
    cast: ['Ren Yamato', 'Sora Morales', 'Evelyn Gray'],
    synopsis: 'In a rain-slicked mega-metropolis governed by automated corporate cartels, an ex-enforcer with compromised neural augments accepts one final extraction contract.',
    tagline: 'Memory is the only currency they cannot trace.',
    priceSample: '₹129',
    priceNumeric: 129,
    accessType: 'pay_per_movie',
    accessLabel: 'Pay per Movie · ₹129',
    resolution: '4K HDR',
    audio: 'Dolby Atmos',
    languages: ['Hindi', 'English', 'Telugu'],
    posterAspectRatio: '2:3',
    isFeatured: false,
    isEnabled: true,
    telegramChannelId: '@flixvault_vip_neon',
    artwork: {
      bgGradient: 'from-fuchsia-950 via-purple-900 to-black',
      glowColor: '#e879f9',
      accentColor: '#f43f5e',
      motif: 'cyberpunk',
    },
  },
  {
    id: 'mv-003',
    title: 'The Obsidian Cipher',
    year: 2024,
    genres: ['Noir', 'Thriller'],
    duration: '2h 12m',
    rating: 'U/A 16+',
    director: 'Julian Moreau',
    cast: ['Vincent Thorne', 'Camille Laurent', 'Oscar Vance'],
    synopsis: 'A retired cryptanalyst in 1950s Geneva is pulled into a clandestine shadow operation when a coded journal belonging to a disappeared diplomat surfaces at an estate auction.',
    tagline: 'Some secrets were never meant to be deciphered.',
    priceSample: '₹99',
    priceNumeric: 99,
    accessType: 'pay_per_movie',
    accessLabel: 'Pay per Movie · ₹99',
    resolution: '4K HDR',
    audio: '5.1 Surround',
    languages: ['Hindi', 'English'],
    posterAspectRatio: '2:3',
    isFeatured: false,
    isEnabled: true,
    telegramChannelId: '@flixvault_vip_cipher',
    artwork: {
      bgGradient: 'from-slate-950 via-purple-950 to-black',
      glowColor: '#9333ea',
      accentColor: '#a855f7',
      motif: 'noir',
    },
  },
];

export const ADDITIONAL_AVAILABLE_MOVIES: Movie[] = [
  {
    id: 'mv-004',
    title: 'Solaris Protocol',
    year: 2026,
    genres: ['Sci-Fi', 'Drama'],
    duration: '2h 35m',
    rating: 'U/A 13+',
    director: 'David O’Connor',
    cast: ['Jonathan Hayes', 'Maya Lin', 'David Kaluuya'],
    synopsis: 'During mankind’s maiden mission to an anomalous radiation belt around Jupiter, an AI navigator begins questioning the psychological validity of the crew’s sensory recollections.',
    tagline: 'When logic falters, human instinct is the final tether.',
    priceSample: '₹199',
    priceNumeric: 199,
    accessType: 'pay_per_movie',
    accessLabel: 'Pay per Movie · ₹199',
    resolution: '4K IMAX',
    audio: 'Dolby Atmos',
    languages: ['Hindi', 'English'],
    posterAspectRatio: '2:3',
    isFeatured: false,
    isEnabled: true,
    telegramChannelId: '@flixvault_vip_solaris',
    artwork: {
      bgGradient: 'from-amber-950 via-purple-950 to-black',
      glowColor: '#c084fc',
      accentColor: '#e879f9',
      motif: 'solaris',
    },
  },
  {
    id: 'mv-005',
    title: 'Subsurface Echoes',
    year: 2025,
    genres: ['Sci-Fi', 'Thriller'],
    duration: '2h 04m',
    rating: 'U/A 13+',
    director: 'Astrid Lindholm',
    cast: ['Maren Solberg', 'Tariq Al-Mansoor', 'Claire Dubois'],
    synopsis: 'Stationed seven miles beneath the Atlantic trench, researchers at an abyssal thermal facility detect seismic harmonic sequences responding directly to human radio transmissions.',
    tagline: 'We thought we were alone in the dark.',
    priceSample: '₹149',
    priceNumeric: 149,
    accessType: 'pay_per_movie',
    accessLabel: 'Pay per Movie · ₹149',
    resolution: '4K HDR',
    audio: 'Dolby Atmos',
    languages: ['Hindi', 'English', 'Malayalam'],
    posterAspectRatio: '2:3',
    isFeatured: false,
    isEnabled: true,
    telegramChannelId: '@flixvault_vip_abyss',
    artwork: {
      bgGradient: 'from-indigo-950 via-violet-950 to-black',
      glowColor: '#6366f1',
      accentColor: '#818cf8',
      motif: 'deepsea',
    },
  },
];

export const ALL_MOVIES_CATALOG: Movie[] = [
  ...CURATED_SHOWCASE_MOVIES,
  ...ADDITIONAL_AVAILABLE_MOVIES,
];

export const SAMPLE_MOVIES = ALL_MOVIES_CATALOG;

// ============================================================
// GENRES
// ============================================================
export const GENRES = [
  'All',
  'Sci-Fi',
  'Cyberpunk',
  'Noir',
  'Thriller',
  'Drama',
  'Action',
  'Mystery',
] as const;

// ============================================================
// LANGUAGES (Batch 2 addition)
// ============================================================
export const AVAILABLE_LANGUAGES = [
  'Hindi',
  'English',
  'Tamil',
  'Telugu',
  'Malayalam',
  'Kannada',
  'Bengali',
  'Marathi',
  'Punjabi',
  'Gujarati',
  'Bhojpuri',
  'Urdu',
] as const;

// ============================================================
// POSTER ASPECT RATIOS (Batch 2 addition)
// ============================================================
export const AVAILABLE_ASPECT_RATIOS = [
  { value: '2:3', label: '2:3 — Classic Movie Poster (Vertical)' },
  { value: '16:9', label: '16:9 — Cinematic Widescreen' },
  { value: '1:1', label: '1:1 — Square (Instagram Style)' },
  { value: '4:5', label: '4:5 — Portrait (Mobile Optimized)' },
] as const;

// ============================================================
// TELEGRAM CONFIG
// ============================================================
export const INITIAL_TELEGRAM_CONFIG: TelegramConfig = {
  botUsername: '@FlixVaultDeliveryBot',
  botConfigured: false,
  channelNamePlaceholder: '@flixvault_vip_private',
  webhookStatus: 'Pending Server Integration',
  adminNotes: 'Telegram bot token and private channel webhook verification will be configured via server environment variables (.env) in Phase 3. Tokens are never exposed in the browser.',
};

// ============================================================
// HELPERS
// ============================================================
export function resolveFeaturedMovie(movies: Movie[]): Movie | null {
  if (!movies || movies.length === 0) return null;
  const active = movies.filter((m) => m.isEnabled !== false);
  if (active.length === 0) return null;
  const explicitlyFeatured = active.find((m) => m.isFeatured);
  return explicitlyFeatured || active[0];
}

export function resolveSecondaryMovies(movies: Movie[], featuredMovieId?: string): Movie[] {
  if (!movies || movies.length <= 1) return [];
  const active = movies.filter((m) => m.isEnabled !== false);
  return active.filter((m) => m.id !== featuredMovieId);
}
