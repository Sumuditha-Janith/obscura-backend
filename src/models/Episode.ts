import mongoose, { Document, Schema } from "mongoose";

export interface IEpisode extends Document {
  _id: mongoose.Types.ObjectId;
  tmdbId: number; // TV Show ID
  seasonNumber: number;
  episodeNumber: number;
  episodeTitle: string;
  airDate: string;
  overview?: string;
  runtime: number;
  stillPath?: string;
  addedBy: mongoose.Types.ObjectId;
  watchStatus: "unwatched" | "watched" | "skipped";
  watchedAt?: Date;
  rating?: number;
}

const episodeSchema = new Schema<IEpisode>(
  {
    tmdbId: { type: Number, required: true, index: true },
    seasonNumber: { type: Number, required: true },
    episodeNumber: { type: Number, required: true },
    episodeTitle: { type: String, required: true },
    airDate: { type: String },
    overview: { type: String },
    runtime: { type: Number, default: 45 }, // Default 45 minutes per episode
    stillPath: { type: String },
    addedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    watchStatus: {
      type: String,
      enum: ["unwatched", "watched", "skipped"],
      default: "unwatched"
    },
    watchedAt: { type: Date },
    rating: { type: Number, min: 1, max: 5 }
  },
  { timestamps: true }
);

// Compound index for efficient queries
episodeSchema.index({ 
  addedBy: 1, 
  tmdbId: 1, 
  seasonNumber: 1, 
  episodeNumber: 1 
}, { unique: true });

// Index for watched episodes
episodeSchema.index({ addedBy: 1, watchStatus: 1 });

export const Episode = mongoose.model<IEpisode>("Episode", episodeSchema);