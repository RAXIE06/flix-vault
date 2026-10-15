import mongoose, { Schema, Document } from 'mongoose';

export interface IMovieDoc extends Document {
  id: string;
  title: string;
  tagline?: string;
  synopsis: string;
  year: number;
  duration: string;
  rating: string;
  genres: string[];
  priceSample: string;
  accessType: 'pay_per_movie';
  accessLabel: string;
  resolution: '4K HDR' | '4K IMAX' | '1080p HD';
  audio: 'Dolby Atmos' | '5.1 Surround';
  director: string;
  cast: string[];
  isFeatured: boolean;
  isEnabled: boolean;
  telegramChannelId?: string;
  customPosterUrl?: string;
  posterStorageId?: string;
  posterContentType?: string;
  posterSize?: number;
  posterUpdatedAt?: Date;
  artwork: {
    bgGradient: string;
    glowColor: string;
    accentColor: string;
    motif: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const MovieSchema = new Schema<IMovieDoc>(
  {
    id: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true, trim: true },
    tagline: { type: String, default: '', trim: true },
    synopsis: { type: String, required: true, trim: true },
    year: { type: Number, required: true },
    duration: { type: String, required: true, default: '2h 00m' },
    rating: { type: String, required: true, default: 'PG-13' },
    genres: { type: [String], required: true, default: ['Sci-Fi'] },
    priceSample: { type: String, required: true, default: '₹149' },
    accessType: {
      type: String,
      default: 'pay_per_movie',
    },
    accessLabel: { type: String, default: 'Pay per Movie · ₹149' },
    resolution: {
      type: String,
      enum: ['4K HDR', '4K IMAX', '1080p HD'],
      default: '4K IMAX',
    },
    audio: {
      type: String,
      enum: ['Dolby Atmos', '5.1 Surround'],
      default: 'Dolby Atmos',
    },
    director: { type: String, required: true, default: 'Director' },
    cast: { type: [String], default: [] },
    isFeatured: { type: Boolean, default: false },
    isEnabled: { type: Boolean, default: true },
    telegramChannelId: { type: String, default: '' },
    customPosterUrl: { type: String, default: '' },
    posterStorageId: { type: String, default: '' },
    posterContentType: { type: String, default: '' },
    posterSize: { type: Number, default: 0 },
    posterUpdatedAt: { type: Date },
    artwork: {
      bgGradient: { type: String, default: 'from-violet-950 via-purple-900 to-black' },
      glowColor: { type: String, default: '#a855f7' },
      accentColor: { type: String, default: '#c084fc' },
      motif: { type: String, default: 'nebula' },
    },
  },
  {
    timestamps: true,
  }
);

export const MovieModel =
  mongoose.models.Movie || mongoose.model<IMovieDoc>('Movie', MovieSchema);
