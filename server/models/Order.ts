import mongoose, { Schema, Document } from 'mongoose';

export interface IOrderDoc extends Document {
  orderId: string;
  movieId: string;
  movieTitle: string;
  originalPrice: number;
  payableAmount: number; // Includes unique paise adjustment
  expectedAmountPaise?: number; // Integer paise e.g. 14938
  currency: string;
  status: 'pending' | 'verified' | 'expired' | 'failed' | 'needs_review';
  telegramChannelId?: string;
  upiVpa: string;
  upiPayeeName: string;
  upiPaymentUri: string;
  userUtr?: string;
  matchedUtr?: string;
  maskedUtr?: string;
  fampayTxnId?: string;
  matchedAmountPaise?: number;
  matchedAmountRupees?: number;
  paymentTimestamp?: Date;
  verifiedAt?: Date;
  expiresAt: Date;
  verificationSource?: string;
  verificationReason?: string;
  matchedEmailUid?: number;
  createdAt: Date;
  updatedAt: Date;
}

const OrderSchema = new Schema<IOrderDoc>(
  {
    orderId: { type: String, required: true, unique: true, index: true },
    movieId: { type: String, required: true, index: true },
    movieTitle: { type: String, required: true },
    originalPrice: { type: Number, required: true },
    payableAmount: { type: Number, required: true },
    expectedAmountPaise: { type: Number },
    currency: { type: String, default: 'INR' },
    status: {
      type: String,
      enum: ['pending', 'verified', 'expired', 'failed', 'needs_review'],
      default: 'pending',
      index: true,
    },
    telegramChannelId: { type: String, default: '' },
    upiVpa: { type: String, required: true },
    upiPayeeName: { type: String, required: true },
    upiPaymentUri: { type: String, required: true },
    userUtr: { type: String },
    matchedUtr: { type: String, sparse: true, index: { unique: true, sparse: true } },
    maskedUtr: { type: String },
    fampayTxnId: { type: String, sparse: true, index: { unique: true, sparse: true } },
    matchedAmountPaise: { type: Number },
    matchedAmountRupees: { type: Number },
    paymentTimestamp: { type: Date },
    verifiedAt: { type: Date },
    expiresAt: { type: Date, required: true },
    verificationSource: { type: String },
    verificationReason: { type: String },
    matchedEmailUid: { type: Number },
  },
  {
    timestamps: true,
  }
);

export const OrderModel =
  mongoose.models.Order || mongoose.model<IOrderDoc>('Order', OrderSchema);
