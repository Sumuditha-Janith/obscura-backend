import { Router } from "express";
import {
  searchMedia,
  getMediaDetails,
  addToWatchlist,
  getWatchlist,
  updateWatchStatus,
  removeFromWatchlist,
  getWatchlistStats,
  getTrending,
  getPopularMovies,
  debugWatchlist,
  getTVShowEpisodes,
  addTVShowToWatchlist,
  fetchTVShowEpisodes,
  updateEpisodeStatus,

} from "../controllers/media.controller";
import { authenticate } from "../middleware/auth";
import { testStats } from "../controllers/media.controller";

const router = Router();

// Public routes (no authentication required)
router.get("/search", searchMedia);
router.get("/details/:type/:tmdbId", getMediaDetails);
router.get("/trending", getTrending);
router.get("/popular", getPopularMovies);
router.post("/watchlist", authenticate, addToWatchlist); // For movies
router.post("/watchlist/tv", authenticate, addTVShowToWatchlist); // For TV shows
router.get("/watchlist", authenticate, getWatchlist);
router.get("/tv/:tmdbId/episodes", authenticate, getTVShowEpisodes);
router.post("/tv/:tmdbId/season/:season/fetch", authenticate, fetchTVShowEpisodes);
router.put("/episodes/:episodeId/status", authenticate, updateEpisodeStatus);

// Protected routes (authentication required)
router.post("/watchlist", authenticate, addToWatchlist);
router.get("/watchlist", authenticate, getWatchlist);
router.get("/watchlist/stats", authenticate, getWatchlistStats);
router.get("/watchlist/debug", authenticate, debugWatchlist);
router.put("/watchlist/:mediaId/status", authenticate, updateWatchStatus);
router.delete("/watchlist/:mediaId", authenticate, removeFromWatchlist);
router.get("/watchlist/test", authenticate, testStats);

export default router;