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
    getTVShowEpisodes,
    addTVShowToWatchlist,
    fetchTVShowEpisodes,
    updateEpisodeStatus,
    getEpisodeStatistics
} from "../controllers/media.controller";
import { authenticate } from "../middleware/auth";
import { generateMediaReport } from "../controllers/report.controller";

const router = Router();

// ==================== PUBLIC ROUTES ====================
router.get("/search", searchMedia);
router.get("/details/:type/:tmdbId", getMediaDetails);
router.get("/trending", getTrending);
router.get("/popular", getPopularMovies);

// ==================== PROTECTED ROUTES ====================

// Watchlist Routes
router.post("/watchlist", authenticate, addToWatchlist); // Add movie to watchlist
router.post("/watchlist/tv", authenticate, addTVShowToWatchlist); // Add TV show to watchlist
router.get("/watchlist", authenticate, getWatchlist); // Get all watchlist items
router.get("/watchlist/stats", authenticate, getWatchlistStats); // Get watchlist statistics
router.put("/watchlist/:mediaId/status", authenticate, updateWatchStatus); // Update movie/TV show status
router.delete("/watchlist/:mediaId", authenticate, removeFromWatchlist); // Remove from watchlist
router.get("/report", authenticate, generateMediaReport); //pdf
router.get("/tv/:tmdbId/episodes", authenticate, getTVShowEpisodes); // Get episodes for a TV show
router.post("/tv/:tmdbId/season/:season/fetch", authenticate, fetchTVShowEpisodes); // Fetch episodes from TMDB
router.put("/episodes/:episodeId/status", authenticate, updateEpisodeStatus); // Update episode status
router.get("/episodes/stats", authenticate, getEpisodeStatistics); // Get episode statistics

export default router;