import mongoose, { Schema, Document } from 'mongoose';

export interface IStorefrontSettingsDoc extends Document {
  key: string;
  featuredMovieId: string;
  storefrontMaxTitles: number;
  upiConfig: {
    upiVpa: string;
    payeeName: string;
    paiseMinRange: number;
    paiseMaxRange: number;
  };
  telegramConfig: {
    botUsername: string;
    botConfigured: boolean;
    channelNamePlaceholder: string;
    webhookStatus: string;
    adminNotes: string;
  };
  updatedAt: Date;
}

const StorefrontSettingsSchema = new Schema<IStorefrontSettingsDoc>(
  {
    key: { type: String, required: true, unique: true, default: 'global' },
    featuredMovieId: { type: String, default: 'mv-001' },
    storefrontMaxTitles: { type: Number, default: 5 },
    upiConfig: {
      upiVpa: { type: String, default: 'flixvault@upi' },
      payeeName: { type: String, default: 'FlixVault Cinema' },
      paiseMinRange: { type: Number, default: 1 },
      paiseMaxRange: { type: Number, default: 99 },
    },
    telegramConfig: {
      botUsername: { type: String, default: '@FlixVaultDeliveryBot' },
      botConfigured: { type: Boolean, default: false },
      channelNamePlaceholder: { type: String, default: '@flixvault_vip_channel' },
      webhookStatus: { type: String, default: 'Pending Server Integration' },
      adminNotes: { type: String, default: 'Configured in Phase 2B' },
    },
  },
  {
    timestamps: true,
  }
);

export const StorefrontSettingsModel =
  mongoose.models.StorefrontSettings ||
  mongoose.model<IStorefrontSettingsDoc>('StorefrontSettings', StorefrontSettingsSchema);
