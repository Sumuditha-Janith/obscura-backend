import { Request, Response } from "express";
import { Media } from "../models/Media";
import { AuthRequest } from "../middleware/auth";
import TMDBService, { TMDBMovie, TMDBTVShow } from "../services/tmdb.service";

export const searchMedia = async (req: Request, res: Response): Promise<void> => {
    try {
        const { query, page = 1 } = req.query;

        if (!query || typeof query !== "string") {
            res.status(400).json({ message: "Search query is required" });
            return;
        }

        const tmdbResponse = await TMDBService.search(query as string, Number(page));

        // Transform TMDB data to consistent format
        const results = tmdbResponse.results.map((item: TMDBMovie | TMDBTVShow) => ({
            id: item.id,
            title: "title" in item ? item.title : item.name,
            overview: item.overview,
            poster_path: item.poster_path,
            backdrop_path: item.backdrop_path,
            release_date: "release_date" in item ? item.release_date : item.first_air_date,
            vote_average: item.vote_average,
            vote_count: item.vote_count,
            type: "title" in item ? "movie" : "tv",
            genre_ids: item.genre_ids,
        }));

        res.status(200).json({
            message: "Search successful",
            data: results,
            pagination: {
                page: tmdbResponse.page,
                total_pages: tmdbResponse.total_pages,
                total_results: tmdbResponse.total_results,
            },
        });
    } catch (err: any) {
        res.status(500).json({ message: err?.message });
    }
};

export const getMediaDetails = async (req: Request, res: Response): Promise<void> => {
    try {
        const { tmdbId, type } = req.params;

        if (!tmdbId || !type) {
            res.status(400).json({ message: "TMDB ID and type are required" });
            return;
        }

        let details: any;

        if (type === "movie") {
            details = await TMDBService.getMovieDetails(Number(tmdbId));
        } else if (type === "tv") {
            details = await TMDBService.getTVDetails(Number(tmdbId));
        } else {
            res.status(400).json({ message: "Invalid media type. Use 'movie' or 'tv'" });
            return;
        }

        // Calculate watch time (assuming average movie is 120 mins, TV episode is 45 mins)
        const watchTimeMinutes = type === "movie"
            ? details.runtime || 120
            : 45; // Default for TV shows

        res.status(200).json({
            message: "Media details fetched successfully",
            data: {
                ...details,
                watchTimeMinutes,
            },
        });
    } catch (err: any) {
        res.status(500).json({ message: err?.message });
    }
};

export const addToWatchlist = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            res.status(401).json({ message: "Unauthorized" });
            return;
        }

        const { tmdbId, title, type, posterPath, releaseDate } = req.body;

        if (!tmdbId || !title || !type) {
            res.status(400).json({ message: "TMDB ID, title, and type are required" });
            return;
        }

        // Check if already in watchlist
        const existing = await Media.findOne({
            tmdbId,
            addedBy: req.user.sub,
            type,
        });

        if (existing) {
            res.status(400).json({ message: "Already in your watchlist" });
            return;
        }

        // Get media details from TMDB
        let tmdbDetails: any = {};
        let watchTimeMinutes = 0;

        try {
            if (type === "movie") {
                const details = await TMDBService.getMovieDetails(tmdbId);
                watchTimeMinutes = details.runtime || 120;
                tmdbDetails = {
                    vote_average: details.vote_average,
                    vote_count: details.vote_count,
                    overview: details.overview,
                    backdrop_path: details.backdrop_path
                };
            } else {
                // For TV shows, get episode count and calculate total time
                const details = await TMDBService.getTVDetails(tmdbId);
                const episodeCount = details.number_of_episodes || 1;
                const episodeRuntime = details.episode_run_time?.[0] || 45; // Average 45 mins per episode

                // Calculate total time for all episodes
                watchTimeMinutes = episodeCount * episodeRuntime;

                tmdbDetails = {
                    vote_average: details.vote_average,
                    vote_count: details.vote_count,
                    overview: details.overview,
                    backdrop_path: details.backdrop_path
                };
            }
        } catch (error) {
            console.error("Failed to fetch TMDB details:", error);
            watchTimeMinutes = type === "movie" ? 120 : 45;
        }

        const newMedia = new Media({
            tmdbId,
            title,
            type,
            posterPath: posterPath || "",
            releaseDate: releaseDate || "",
            addedBy: req.user.sub,
            watchStatus: "planned",
            watchTimeMinutes,
            vote_average: tmdbDetails.vote_average,
            vote_count: tmdbDetails.vote_count,
            overview: tmdbDetails.overview,
            backdrop_path: tmdbDetails.backdrop_path
        });

        await newMedia.save();

        res.status(201).json({
            message: "Added to watchlist successfully",
            data: newMedia,
        });
    } catch (err: any) {
        res.status(500).json({ message: err?.message });
    }
};

export const getWatchlist = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            res.status(401).json({ message: "Unauthorized" });
            return;
        }

        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const skip = (page - 1) * limit;
        const status = req.query.status as string;

        const filter: any = { addedBy: req.user.sub };
        if (status && ["planned", "watching", "completed"].includes(status)) {
            filter.watchStatus = status;
        }

        const watchlist = await Media.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const total = await Media.countDocuments(filter);

        // Calculate total watch time
        const totalWatchTime = await Media.aggregate([
            { $match: filter },
            { $group: { _id: null, total: { $sum: "$watchTimeMinutes" } } },
        ]);

        res.status(200).json({
            message: "Watchlist fetched successfully",
            data: watchlist,
            stats: {
                totalWatchTime: totalWatchTime[0]?.total || 0,
                totalItems: total,
            },
            pagination: {
                page,
                totalPages: Math.ceil(total / limit),
                total,
            },
        });
    } catch (err: any) {
        res.status(500).json({ message: err?.message });
    }
};

export const updateWatchStatus = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            res.status(401).json({ message: "Unauthorized" });
            return;
        }

        const { mediaId } = req.params;
        const { watchStatus, rating } = req.body;

        if (!mediaId) {
            res.status(400).json({ message: "Media ID is required" });
            return;
        }

        const media = await Media.findOne({
            _id: mediaId,
            addedBy: req.user.sub,
        });

        if (!media) {
            res.status(404).json({ message: "Media not found in your watchlist" });
            return;
        }

        if (watchStatus && ["planned", "watching", "completed"].includes(watchStatus)) {
            media.watchStatus = watchStatus;
        }

        if (rating !== undefined) {
            if (rating < 1 || rating > 5) {
                res.status(400).json({ message: "Rating must be between 1 and 5" });
                return;
            }
            media.rating = rating;
        }

        await media.save();

        res.status(200).json({
            message: "Watch status updated successfully",
            data: media,
        });
    } catch (err: any) {
        res.status(500).json({ message: err?.message });
    }
};

export const removeFromWatchlist = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            res.status(401).json({ message: "Unauthorized" });
            return;
        }

        const { mediaId } = req.params;

        const media = await Media.findOneAndDelete({
            _id: mediaId,
            addedBy: req.user.sub,
        });

        if (!media) {
            res.status(404).json({ message: "Media not found in your watchlist" });
            return;
        }

        res.status(200).json({
            message: "Removed from watchlist successfully",
        });
    } catch (err: any) {
        res.status(500).json({ message: err?.message });
    }
};

export const getWatchlistStats = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            res.status(401).json({ message: "Unauthorized" });
            return;
        }

        const userId = req.user.sub;

        // Get all stats in parallel for better performance
        const [
            totalItems,
            movies,
            tvShows,
            statusStats,
            totalWatchTime,
            movieWatchTime,
            tvWatchTime
        ] = await Promise.all([
            // Total items
            Media.countDocuments({ addedBy: userId }),

            // Movie stats
            Media.aggregate([
                { $match: { addedBy: userId, type: "movie" } },
                {
                    $group: {
                        _id: null,
                        count: { $sum: 1 },
                        totalTime: { $sum: "$watchTimeMinutes" },
                        completedCount: {
                            $sum: { $cond: [{ $eq: ["$watchStatus", "completed"] }, 1, 0] }
                        }
                    }
                }
            ]),

            // TV show stats
            Media.aggregate([
                { $match: { addedBy: userId, type: "tv" } },
                {
                    $group: {
                        _id: null,
                        count: { $sum: 1 },
                        totalTime: { $sum: "$watchTimeMinutes" },
                        completedCount: {
                            $sum: { $cond: [{ $eq: ["$watchStatus", "completed"] }, 1, 0] }
                        }
                    }
                }
            ]),

            // Status stats
            Media.aggregate([
                { $match: { addedBy: userId } },
                {
                    $group: {
                        _id: "$watchStatus",
                        count: { $sum: 1 },
                        totalTime: { $sum: "$watchTimeMinutes" },
                    },
                },
            ]),

            // Total watch time (all)
            Media.aggregate([
                { $match: { addedBy: userId } },
                { $group: { _id: null, total: { $sum: "$watchTimeMinutes" } } },
            ]),

            // Movie watch time (only completed)
            Media.aggregate([
                {
                    $match: {
                        addedBy: userId,
                        type: "movie",
                        watchStatus: "completed"
                    }
                },
                { $group: { _id: null, total: { $sum: "$watchTimeMinutes" } } },
            ]),

            // TV watch time (only completed)
            Media.aggregate([
                {
                    $match: {
                        addedBy: userId,
                        type: "tv",
                        watchStatus: "completed"
                    }
                },
                { $group: { _id: null, total: { $sum: "$watchTimeMinutes" } } },
            ])
        ]);

        // Format status stats
        const byStatus = statusStats.map((stat: any) => ({
            status: stat._id,
            count: stat.count,
            time: stat.totalTime || 0,
        }));

        // Get type distribution
        const byType = [
            { type: "movie", count: movies[0]?.count || 0 },
            { type: "tv", count: tvShows[0]?.count || 0 }
        ];

        // Calculate totals
        const totalWatchTimeValue = totalWatchTime[0]?.total || 0;
        const movieCompletedTime = movieWatchTime[0]?.total || 0;
        const tvCompletedTime = tvWatchTime[0]?.total || 0;
        const completedMovies = movies[0]?.completedCount || 0;
        const completedTVShows = tvShows[0]?.completedCount || 0;

        // Format times
        const formatTime = (minutes: number): string => {
            const hours = Math.floor(minutes / 60);
            const mins = minutes % 60;
            return `${hours}h ${mins}m`;
        };

        res.status(200).json({
            message: "Watchlist stats fetched successfully",
            data: {
                totalItems,
                totalWatchTime: totalWatchTimeValue,
                totalWatchTimeFormatted: formatTime(totalWatchTimeValue),

                // Movie-specific stats
                movieStats: {
                    total: movies[0]?.count || 0,
                    completed: completedMovies,
                    watchTime: movieCompletedTime,
                    watchTimeFormatted: formatTime(movieCompletedTime)
                },

                // TV-specific stats
                tvStats: {
                    total: tvShows[0]?.count || 0,
                    completed: completedTVShows,
                    watchTime: tvCompletedTime,
                    watchTimeFormatted: formatTime(tvCompletedTime)
                },

                // Status distribution
                byStatus,
                byType,

                // Quick access counts
                plannedCount: byStatus.find((s: any) => s.status === "planned")?.count || 0,
                watchingCount: byStatus.find((s: any) => s.status === "watching")?.count || 0,
                completedCount: byStatus.find((s: any) => s.status === "completed")?.count || 0,
            },
        });
    } catch (err: any) {
        console.error("Get Stats Error:", err);
        res.status(500).json({ message: err?.message });
    }
};

export const getTrending = async (req: Request, res: Response): Promise<void> => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const timeWindow = (req.query.timeWindow as "day" | "week") || "week";

        const trending = await TMDBService.getTrending(timeWindow, page);

        res.status(200).json({
            message: "Trending content fetched successfully",
            data: trending.results,
            pagination: {
                page: trending.page,
                total_pages: trending.total_pages,
                total_results: trending.total_results,
            },
        });
    } catch (err: any) {
        res.status(500).json({ message: err?.message });
    }
};

export const getPopularMovies = async (req: Request, res: Response): Promise<void> => {
    try {
        const page = parseInt(req.query.page as string) || 1;

        const popular = await TMDBService.getPopularMovies(page);

        res.status(200).json({
            message: "Popular movies fetched successfully",
            data: popular.results,
            pagination: {
                page: popular.page,
                total_pages: popular.total_pages,
                total_results: popular.total_results,
            },
        });
    } catch (err: any) {
        res.status(500).json({ message: err?.message });
    }
};