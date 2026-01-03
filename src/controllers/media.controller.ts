import { Request, Response } from "express";
import { Media } from "../models/Media";
import { AuthRequest } from "../middleware/auth";
import TMDBService, { TMDBMovie, TMDBTVShow } from "../services/tmdb.service";
import mongoose from "mongoose";
import { Episode } from "../models/Episode";

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

    console.log(`🔄 Update status request for mediaId: ${mediaId}`);
    console.log(`📝 New status: ${watchStatus}, Rating: ${rating}`);

    if (!mediaId) {
      res.status(400).json({ message: "Media ID is required" });
      return;
    }

    // Check if mediaId is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(mediaId)) {
      console.error(`❌ Invalid mediaId format: ${mediaId}`);
      res.status(400).json({ message: "Invalid media ID format" });
      return;
    }

    const media = await Media.findOne({
      _id: new mongoose.Types.ObjectId(mediaId),
      addedBy: req.user.sub,
    });

    if (!media) {
      console.error(`❌ Media not found: ${mediaId} for user ${req.user.sub}`);
      res.status(404).json({ message: "Media not found in your watchlist" });
      return;
    }

    console.log(`📋 Found media: ${media.title}, Current status: ${media.watchStatus}`);

    if (watchStatus && ["planned", "watching", "completed"].includes(watchStatus)) {
      console.log(`🔄 Changing status from ${media.watchStatus} to ${watchStatus}`);
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
    
    console.log(`✅ Saved: ${media.title} is now ${media.watchStatus}`);
    console.log(`📊 Watch time: ${media.watchTimeMinutes} minutes`);

    res.status(200).json({
      message: "Watch status updated successfully",
      data: {
        _id: media._id,
        title: media.title,
        watchStatus: media.watchStatus,
        watchTimeMinutes: media.watchTimeMinutes,
        type: media.type
      },
    });
  } catch (err: any) {
    console.error("Update Status Error:", err);
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
    console.log(`📊 Fetching stats for user: ${userId}`);

    // Get simple counts first to verify
    const totalItems = await Media.countDocuments({ addedBy: userId });
    const completedItems = await Media.countDocuments({ 
      addedBy: userId, 
      watchStatus: "completed" 
    });
    const plannedItems = await Media.countDocuments({ 
      addedBy: userId, 
      watchStatus: "planned" 
    });
    const watchingItems = await Media.countDocuments({ 
      addedBy: userId, 
      watchStatus: "watching" 
    });

    console.log(`📈 Direct counts: Total=${totalItems}, Completed=${completedItems}, Planned=${plannedItems}, Watching=${watchingItems}`);

    // Get all items to debug
    const allItems = await Media.find({ addedBy: userId })
      .select("title type watchStatus watchTimeMinutes")
      .lean();

    console.log(`📋 All items in database (${allItems.length}):`);
    allItems.forEach(item => {
      console.log(`  - ${item.title}: ${item.watchStatus} (${item.watchTimeMinutes} mins)`);
    });

    // Calculate stats manually to ensure accuracy
    let totalWatchTime = 0;
    let movieStats = { total: 0, completed: 0, watchTime: 0 };
    let tvStats = { total: 0, completed: 0, watchTime: 0 };
    const byStatus: any[] = [];
    const byType: any[] = [];

    // Initialize status counts
    const statusCounts: Record<string, { count: number, time: number }> = {
      planned: { count: 0, time: 0 },
      watching: { count: 0, time: 0 },
      completed: { count: 0, time: 0 }
    };

    // Initialize type counts
    const typeCounts: Record<string, number> = {
      movie: 0,
      tv: 0
    };

    // Calculate all stats
    allItems.forEach(item => {
      // Count by type
      typeCounts[item.type] = (typeCounts[item.type] || 0) + 1;

      // Count by status
      const status = item.watchStatus || "planned";
      statusCounts[status].count += 1;
      
      // Add watch time if completed
      if (status === "completed") {
        const watchTime = item.watchTimeMinutes || 0;
        statusCounts.completed.time += watchTime;
        totalWatchTime += watchTime;

        // Add to type-specific completed stats
        if (item.type === "movie") {
          movieStats.completed += 1;
          movieStats.watchTime += watchTime;
        } else if (item.type === "tv") {
          tvStats.completed += 1;
          tvStats.watchTime += watchTime;
        }
      }

      // Update type totals
      if (item.type === "movie") {
        movieStats.total += 1;
      } else if (item.type === "tv") {
        tvStats.total += 1;
      }
    });

    // Convert status counts to array
    Object.entries(statusCounts).forEach(([status, data]) => {
      if (data.count > 0) {
        byStatus.push({
          status,
          count: data.count,
          time: data.time
        });
      }
    });

    // Convert type counts to array
    Object.entries(typeCounts).forEach(([type, count]) => {
      if (count > 0) {
        byType.push({ type, count });
      }
    });

    // Format times
    const formatTime = (minutes: number): string => {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return `${hours}h ${mins}m`;
    };

    // Build response
    const responseData = {
      totalItems,
      totalWatchTime,
      totalWatchTimeFormatted: formatTime(totalWatchTime),

      movieStats: {
        total: movieStats.total,
        completed: movieStats.completed,
        watchTime: movieStats.watchTime,
        watchTimeFormatted: formatTime(movieStats.watchTime)
      },

      tvStats: {
        total: tvStats.total,
        completed: tvStats.completed,
        watchTime: tvStats.watchTime,
        watchTimeFormatted: formatTime(tvStats.watchTime)
      },

      byStatus,
      byType,

      plannedCount: statusCounts.planned.count,
      watchingCount: statusCounts.watching.count,
      completedCount: statusCounts.completed.count,
    };

    console.log("📊 Calculated stats response:");
    console.log("- Total items:", totalItems);
    console.log("- Completed count:", responseData.completedCount);
    console.log("- Planned count:", responseData.plannedCount);
    console.log("- Watching count:", responseData.watchingCount);
    console.log("- Total watch time:", totalWatchTime, "mins");
    console.log("- Movie stats:", movieStats);
    console.log("- TV stats:", tvStats);
    console.log("- By status:", byStatus);
    console.log("- By type:", byType);

    res.status(200).json({
      message: "Watchlist stats fetched successfully",
      data: responseData,
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

export const getTVShowEpisodes = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const { tmdbId } = req.params;
    const { season } = req.query;

    if (!tmdbId) {
      res.status(400).json({ message: "TMDB ID is required" });
      return;
    }

    const filter: any = { 
      addedBy: req.user.sub,
      tmdbId: Number(tmdbId)
    };

    if (season) {
      filter.seasonNumber = Number(season);
    }

    const episodes = await Episode.find(filter)
      .sort({ seasonNumber: 1, episodeNumber: 1 })
      .lean();

    // Get episode details from TMDB if needed
    if (episodes.length === 0 && !season) {
      try {
        const tvDetails = await TMDBService.getTVDetails(Number(tmdbId));
        const seasons = tvDetails.seasons || [];
        
        // You could fetch all episodes here, but for performance, 
        // we'll just return the season structure
        res.status(200).json({
          message: "TV show seasons fetched",
          data: {
            seasons,
            episodes: [] // Empty episodes array, needs to be populated
          }
        });
        return;
      } catch (error) {
        console.error("Failed to fetch TV details:", error);
      }
    }

    // Group episodes by season
    const episodesBySeason: Record<number, any[]> = {};
    episodes.forEach(episode => {
      if (!episodesBySeason[episode.seasonNumber]) {
        episodesBySeason[episode.seasonNumber] = [];
      }
      episodesBySeason[episode.seasonNumber].push(episode);
    });

    res.status(200).json({
      message: "TV show episodes fetched successfully",
      data: {
        episodesBySeason,
        totalEpisodes: episodes.length,
        watchedEpisodes: episodes.filter(e => e.watchStatus === "watched").length
      }
    });
  } catch (err: any) {
    console.error("Get TV episodes error:", err);
    res.status(500).json({ message: err?.message });
  }
};

export const addTVShowToWatchlist = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const { tmdbId, title, type, posterPath, backdrop_path, seasonCount, episodeCount } = req.body;

    if (!tmdbId || !title || type !== "tv") {
      res.status(400).json({ message: "Invalid TV show data" });
      return;
    }

    // Check if TV show already exists in watchlist
    const existingTVShow = await Media.findOne({
      tmdbId,
      addedBy: req.user.sub,
      type: "tv"
    });

    if (existingTVShow) {
      res.status(400).json({ message: "TV show already in your watchlist" });
      return;
    }

    // Get TV show details from TMDB
    let tvDetails: any = {};
    try {
      tvDetails = await TMDBService.getTVDetails(tmdbId);
    } catch (error) {
      console.error("Failed to fetch TV details:", error);
    }

    // Create TV show entry in Media collection
    const newTVShow = new Media({
      tmdbId,
      title,
      type: "tv",
      posterPath: posterPath || tvDetails.poster_path || "",
      backdrop_path: backdrop_path || tvDetails.backdrop_path || "",
      releaseDate: tvDetails.first_air_date || "",
      addedBy: req.user.sub,
      watchStatus: "planned",
      watchTimeMinutes: 0, // Will be calculated based on watched episodes
      vote_average: tvDetails.vote_average || 0,
      vote_count: tvDetails.vote_count || 0,
      overview: tvDetails.overview || "",
      seasonCount: seasonCount || tvDetails.number_of_seasons || 1,
      episodeCount: episodeCount || tvDetails.number_of_episodes || 1
    });

    await newTVShow.save();

    res.status(201).json({
      message: "TV show added to watchlist successfully",
      data: newTVShow
    });
  } catch (err: any) {
    console.error("Add TV show error:", err);
    res.status(500).json({ message: err?.message });
  }
};

export const fetchTVShowEpisodes = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const { tmdbId, season } = req.params;

    // Fetch episodes from TMDB
    const tmdbResponse = await TMDBService.getTVSeasonDetails(Number(tmdbId), Number(season));

    // Store episodes in database
    const episodesToSave = tmdbResponse.episodes.map((episode: any) => ({
      tmdbId: Number(tmdbId),
      seasonNumber: Number(season),
      episodeNumber: episode.episode_number,
      episodeTitle: episode.name,
      airDate: episode.air_date,
      overview: episode.overview,
      runtime: episode.runtime || 45,
      stillPath: episode.still_path,
      addedBy: req.user!.sub,
      watchStatus: "unwatched"
    }));

    // Bulk upsert episodes
    for (const episode of episodesToSave) {
      await Episode.updateOne(
        {
          tmdbId: episode.tmdbId,
          seasonNumber: episode.seasonNumber,
          episodeNumber: episode.episodeNumber,
          addedBy: episode.addedBy
        },
        episode,
        { upsert: true }
      );
    }

    res.status(200).json({
      message: `Season ${season} episodes fetched and saved successfully`,
      data: {
        season: Number(season),
        episodeCount: episodesToSave.length
      }
    });
  } catch (err: any) {
    console.error("Fetch episodes error:", err);
    res.status(500).json({ message: err?.message });
  }
};

export const updateEpisodeStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const { episodeId } = req.params;
    const { watchStatus, rating } = req.body;

    if (!episodeId) {
      res.status(400).json({ message: "Episode ID is required" });
      return;
    }

    if (watchStatus && !["unwatched", "watched", "skipped"].includes(watchStatus)) {
      res.status(400).json({ message: "Invalid watch status" });
      return;
    }

    const episode = await Episode.findById(episodeId);
    if (!episode || episode.addedBy.toString() !== req.user.sub) {
      res.status(404).json({ message: "Episode not found" });
      return;
    }

    if (watchStatus) {
      episode.watchStatus = watchStatus;
      if (watchStatus === "watched") {
        episode.watchedAt = new Date();
      } else if (watchStatus === "unwatched") {
        episode.watchedAt = undefined;
      }
    }

    if (rating !== undefined) {
      if (rating < 1 || rating > 5) {
        res.status(400).json({ message: "Rating must be between 1 and 5" });
        return;
      }
      episode.rating = rating;
    }

    await episode.save();

    // Update TV show watch time and status
    await updateTVShowStats(req.user.sub, episode.tmdbId);

    res.status(200).json({
      message: "Episode status updated successfully",
      data: episode
    });
  } catch (err: any) {
    console.error("Update episode error:", err);
    res.status(500).json({ message: err?.message });
  }
};

// Helper function to update TV show stats
const updateTVShowStats = async (userId: string, tmdbId: number) => {
  try {
    // Get all episodes for this TV show
    const episodes = await Episode.find({
      addedBy: userId,
      tmdbId
    });

    // Calculate watched episodes and total watch time
    const watchedEpisodes = episodes.filter(e => e.watchStatus === "watched");
    const totalWatchTime = watchedEpisodes.reduce((sum, ep) => sum + (ep.runtime || 45), 0);
    const totalEpisodes = episodes.length;

    // Update TV show in Media collection
    const tvShow = await Media.findOne({
      addedBy: userId,
      tmdbId,
      type: "tv"
    });

    if (tvShow) {
      tvShow.watchTimeMinutes = totalWatchTime;
      
      // Update overall watch status
      if (watchedEpisodes.length === 0) {
        tvShow.watchStatus = "planned";
      } else if (watchedEpisodes.length === totalEpisodes) {
        tvShow.watchStatus = "completed";
      } else {
        tvShow.watchStatus = "watching";
      }

      await tvShow.save();
    }
  } catch (error) {
    console.error("Update TV show stats error:", error);
  }
};

////////////////////////////// For Debugging ////////////////////////////// 
export const debugWatchlist = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const userId = req.user.sub;
    
    // Get all watchlist items with details
    const watchlist = await Media.find({ addedBy: userId })
      .select('title type watchStatus watchTimeMinutes')
      .lean();
    
    // Get raw counts
    const totalItems = await Media.countDocuments({ addedBy: userId });
    const completedItems = await Media.countDocuments({ 
      addedBy: userId, 
      watchStatus: "completed" 
    });
    const plannedItems = await Media.countDocuments({ 
      addedBy: userId, 
      watchStatus: "planned" 
    });
    const watchingItems = await Media.countDocuments({ 
      addedBy: userId, 
      watchStatus: "watching" 
    });
    
    // Get completed watch time
    const completedTimeAgg = await Media.aggregate([
      { 
        $match: { 
          addedBy: userId, 
          watchStatus: "completed" 
        } 
      },
      { 
        $group: { 
          _id: null, 
          totalTime: { $sum: "$watchTimeMinutes" } 
        } 
      }
    ]);
    
    const completedTime = completedTimeAgg[0]?.totalTime || 0;

    res.status(200).json({
      message: "Debug info",
      data: {
        userId,
        totalItems,
        completedItems,
        plannedItems,
        watchingItems,
        completedTime,
        watchlist
      }
    });
  } catch (err: any) {
    console.error("Debug Error:", err);
    res.status(500).json({ message: err?.message });
  }
};

export const testStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const userId = req.user.sub;
    
    // Get simple counts directly
    const totalItems = await Media.countDocuments({ addedBy: userId });
    const completedItems = await Media.countDocuments({ 
      addedBy: userId, 
      watchStatus: "completed" 
    });
    
    // Get all items to debug
    const allItems = await Media.find({ addedBy: userId })
      .select("title type watchStatus watchTimeMinutes")
      .lean();
    
    // Calculate completed watch time manually
    let completedWatchTime = 0;
    allItems.forEach(item => {
      if (item.watchStatus === "completed") {
        completedWatchTime += item.watchTimeMinutes || 0;
      }
    });
    
    res.status(200).json({
      message: "Test stats",
      data: {
        userId,
        totalItems,
        completedItems,
        completedWatchTime,
        items: allItems.map(item => ({
          title: item.title,
          type: item.type,
          status: item.watchStatus,
          time: item.watchTimeMinutes
        }))
      }
    });
  } catch (err: any) {
    console.error("Test Stats Error:", err);
    res.status(500).json({ message: err?.message });
  }
};