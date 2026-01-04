import mongoose, { Document, Schema } from "mongoose";

export interface IMedia extends Document {
  _id: mongoose.Types.ObjectId;
  tmdbId: number;
  title: string;
  type: "movie" | "tv";
  posterPath?: string;
  backdrop_path?: string;
  releaseDate?: string;
  addedBy: mongoose.Types.ObjectId;
  watchStatus: "planned" | "watching" | "completed";
  rating?: number;
  watchTimeMinutes: number;
  vote_average?: number;
  vote_count?: number;
  overview?: string;
  
  // TV Show specific fields
  seasonCount?: number;
  episodeCount?: number;
  totalEpisodesWatched?: number;
  totalWatchTime?: number;
  
  createdAt?: Date;
  updatedAt?: Date;
}

const mediaSchema = new Schema<IMedia>(
  {
    tmdbId: { type: Number, required: true },
    title: { type: String, required: true },
    type: { type: String, enum: ["movie", "tv"], required: true },
    posterPath: { type: String },
    backdrop_path: { type: String },
    releaseDate: { type: String },
    addedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    watchStatus: {
      type: String,
      enum: ["planned", "watching", "completed"],
      default: "planned"
    },
    rating: { type: Number, min: 1, max: 5 },
    watchTimeMinutes: { type: Number, default: 0 },
    vote_average: { type: Number },
    vote_count: { type: Number },
    overview: { type: String },
    
    // TV Show specific fields
    seasonCount: { type: Number, default: 1 },
    episodeCount: { type: Number, default: 1 },
    totalEpisodesWatched: { type: Number, default: 0 },
    totalWatchTime: { type: Number, default: 0 }
  },
  { timestamps: true }
);

// Indexes
mediaSchema.index({ addedBy: 1, type: 1, watchStatus: 1 });
mediaSchema.index({ addedBy: 1, tmdbId: 1, type: 1 });

export const Media = mongoose.model<IMedia>("Media", mediaSchema);