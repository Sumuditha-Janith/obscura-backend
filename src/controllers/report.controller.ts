// cinetime-backend/src/controllers/report.controller.ts
import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import PDFDocument from "pdfkit";
import { Media } from "../models/Media";
import { Episode } from "../models/Episode";
import { User } from "../models/User";

export const generateMediaReport = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            res.status(401).json({ message: "Unauthorized" });
            return;
        }

        const userId = req.user.sub;
        const { period } = req.query; // Optional: 'week', 'month', 'year', 'all'

        // Fetch user data
        const user = await User.findById(userId);
        if (!user) {
            res.status(404).json({ message: "User not found" });
            return;
        }

        // Calculate date range based on period
        const dateFilter: any = {};
        if (period && period !== 'all') {
            const now = new Date();
            let startDate = new Date();
            
            switch (period) {
                case 'week':
                    startDate.setDate(now.getDate() - 7);
                    break;
                case 'month':
                    startDate.setMonth(now.getMonth() - 1);
                    break;
                case 'year':
                    startDate.setFullYear(now.getFullYear() - 1);
                    break;
            }
            dateFilter.createdAt = { $gte: startDate };
        }

        // Fetch media data
        const mediaItems = await Media.find({ 
            addedBy: userId,
            ...dateFilter 
        }).sort({ createdAt: -1 });

        // Fetch episode data with TV show information
        const episodes = await Episode.find({ 
            addedBy: userId,
            ...dateFilter 
        });

        // Group episodes by TV show
        const episodesByShow = new Map<number, any[]>();
        
        episodes.forEach(episode => {
            if (!episodesByShow.has(episode.tmdbId)) {
                episodesByShow.set(episode.tmdbId, []);
            }
            episodesByShow.get(episode.tmdbId)!.push(episode);
        });

        // Get completed movies
        const completedMovies = mediaItems.filter(item => 
            item.type === "movie" && item.watchStatus === "completed"
        );

        // Get watching TV shows
        const watchingTVShows = mediaItems.filter(item => 
            item.type === "tv" && item.watchStatus === "watching"
        );

        // Get completed TV shows
        const completedTVShows = mediaItems.filter(item => 
            item.type === "tv" && item.watchStatus === "completed"
        );

        // Calculate statistics
        const stats = await calculateMediaStats(mediaItems, episodes, period as string);

        // Add TV show episodes data to stats
        stats.tvShowEpisodes = [];
        
        // Get watched episodes for currently watching shows
        watchingTVShows.forEach(show => {
            const showEpisodes = episodesByShow.get(show.tmdbId) || [];
            const watchedEpisodes = showEpisodes.filter(ep => ep.watchStatus === "watched");
            
            stats.tvShowEpisodes.push({
                showId: show.tmdbId,
                showTitle: show.title,
                status: "watching",
                watchedEpisodes: watchedEpisodes.map(ep => ({
                    season: ep.seasonNumber,
                    episode: ep.episodeNumber,
                    title: ep.episodeTitle,
                    date: ep.watchedAt || ep.createdAt,
                    runtime: ep.runtime || 45
                })),
                totalWatched: watchedEpisodes.length,
                totalEpisodes: showEpisodes.length
            });
        });

        // Get all episodes for completed shows
        completedTVShows.forEach(show => {
            const showEpisodes = episodesByShow.get(show.tmdbId) || [];
            const watchedEpisodes = showEpisodes.filter(ep => ep.watchStatus === "watched");
            
            stats.tvShowEpisodes.push({
                showId: show.tmdbId,
                showTitle: show.title,
                status: "completed",
                watchedEpisodes: watchedEpisodes.map(ep => ({
                    season: ep.seasonNumber,
                    episode: ep.episodeNumber,
                    title: ep.episodeTitle,
                    date: ep.watchedAt || ep.createdAt,
                    runtime: ep.runtime || 45
                })),
                totalWatched: watchedEpisodes.length,
                totalEpisodes: showEpisodes.length
            });
        });

        // Add completed movies data
        stats.completedMovies = completedMovies.map(movie => ({
            title: movie.title,
            releaseYear: movie.releaseDate ? new Date(movie.releaseDate).getFullYear() : "Unknown",
            watchTime: movie.watchTimeMinutes || 120,
            rating: movie.rating || "Not rated",
            completedDate: movie.updatedAt
        }));

        // Generate PDF
        const doc = new PDFDocument({
            size: 'A4',
            margin: 50,
            bufferPages: true
        });

        // Set response headers
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Cinetime_Report_${Date.now()}.pdf"`);

        // Pipe PDF to response
        doc.pipe(res);

        // Generate PDF content
        await generatePDFContent(doc, user, stats, period as string);

        // Finalize PDF
        doc.end();
    } catch (err: any) {
        console.error("Report generation error:", err);
        res.status(500).json({ message: err?.message || "Failed to generate report" });
    }
};

// Helper function to calculate statistics
const calculateMediaStats = async (mediaItems: any[], episodes: any[], period: string) => {
    const stats: any = {
        period: period || 'all',
        generatedAt: new Date(),
        totals: {
            movies: 0,
            tvShows: 0,
            episodes: episodes.length,
            totalWatchTime: 0
        },
        byStatus: {
            planned: { movies: 0, tvShows: 0, time: 0 },
            watching: { movies: 0, tvShows: 0, time: 0 },
            completed: { movies: 0, tvShows: 0, time: 0 }
        }
    };

    // Calculate basic statistics
    mediaItems.forEach(item => {
        if (item.type === "movie") {
            stats.totals.movies++;
            stats.byStatus[item.watchStatus].movies++;
            stats.byStatus[item.watchStatus].time += item.watchTimeMinutes || 0;
            
            if (item.watchStatus === "completed") {
                stats.totals.totalWatchTime += item.watchTimeMinutes || 0;
            }
        } else if (item.type === "tv") {
            stats.totals.tvShows++;
            stats.byStatus[item.watchStatus].tvShows++;
            
            // TV show watch time from episodes
            const showEpisodes = episodes.filter(ep => ep.tmdbId === item.tmdbId);
            const showWatchTime = showEpisodes
                .filter(ep => ep.watchStatus === "watched")
                .reduce((sum, ep) => sum + (ep.runtime || 45), 0);
            
            stats.byStatus[item.watchStatus].time += showWatchTime;
            
            if (item.watchStatus === "completed") {
                stats.totals.totalWatchTime += showWatchTime;
            }
        }
    });

    // Calculate episode statistics
    const watchedEpisodes = episodes.filter(ep => ep.watchStatus === "watched");
    const skippedEpisodes = episodes.filter(ep => ep.watchStatus === "skipped");
    
    stats.episodeStats = {
        total: episodes.length,
        watched: watchedEpisodes.length,
        skipped: skippedEpisodes.length,
        averageRating: watchedEpisodes.length > 0 
            ? watchedEpisodes.reduce((sum, ep) => sum + (ep.rating || 0), 0) / watchedEpisodes.length
            : 0,
        totalWatchTime: watchedEpisodes.reduce((sum, ep) => sum + (ep.runtime || 45), 0)
    };

    return stats;
};

// Helper function to generate PDF content
const generatePDFContent = async (doc: PDFKit.PDFDocument, user: any, stats: any, period: string) => {
    const { email } = user;
    const periodText = period === 'all' ? 'All Time' : `Last ${period.charAt(0).toUpperCase() + period.slice(1)}`;

    // Helper function to format time
    const formatTime = (minutes: number): string => {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        const days = Math.floor(hours / 24);
        const remainingHours = hours % 24;
        
        if (days > 0) {
            return `${days}d ${remainingHours}h ${mins}m`;
        } else if (hours > 0) {
            return `${hours}h ${mins}m`;
        }
        return `${mins}m`;
    };

    // Helper function to format date
    const formatDate = (dateString: string | Date): string => {
        if (!dateString) return "Unknown";
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric' 
        });
    };

    // Header - Use simple fonts to avoid encoding issues
    doc.font('Helvetica-Bold')
       .fontSize(24)
       .fillColor('#dc2626') // Rose color from theme
       .text('CINETIME', 50, 50)
       .moveDown(0.5);
    
    doc.font('Helvetica-Bold')
       .fontSize(16)
       .fillColor('#374151') // Slate-700
       .text('Media Activity Report', { underline: false })
       .moveDown(1);

    // User info
    doc.font('Helvetica')
       .fontSize(12)
       .fillColor('#4b5563') // Slate-600
       .text(`User: ${email}`, { continued: true })
       .text(`  |  Period: ${periodText}`, { continued: true })
       .text(`  |  Generated: ${stats.generatedAt.toLocaleDateString()}`)
       .moveDown(2);

    // Summary Section
    doc.font('Helvetica-Bold')
       .fontSize(14)
       .fillColor('#1f2937') // Slate-800
       .text('Summary Statistics')
       .moveDown(0.5);

    const summaryY = doc.y;
    
    // Left column - Totals
    doc.font('Helvetica')
       .fontSize(11)
       .fillColor('#374151')
       .text('Total Items:', 50, summaryY)
       .fillColor('#111827')
       .text(`${stats.totals.movies + stats.totals.tvShows}`, 150, summaryY);
    
    doc.fillColor('#374151')
       .text('Movies:', 50, summaryY + 20)
       .fillColor('#111827')
       .text(`${stats.totals.movies}`, 150, summaryY + 20);
    
    doc.fillColor('#374151')
       .text('TV Shows:', 50, summaryY + 40)
       .fillColor('#111827')
       .text(`${stats.totals.tvShows}`, 150, summaryY + 40);
    
    doc.fillColor('#374151')
       .text('Episodes:', 50, summaryY + 60)
       .fillColor('#111827')
       .text(`${stats.totals.episodes}`, 150, summaryY + 60);
    
    doc.fillColor('#374151')
       .text('Total Watch Time:', 50, summaryY + 80)
       .fillColor('#dc2626') // Rose color
       .text(formatTime(stats.totals.totalWatchTime), 150, summaryY + 80);

    // Right column - Status breakdown
    const statusY = summaryY;
    
    doc.fillColor('#374151')
       .text('Status Breakdown:', 300, statusY)
       .fillColor('#111827');
    
    const statuses = ['planned', 'watching', 'completed'];
    let statusOffset = 20;
    
    statuses.forEach(status => {
        const movies = stats.byStatus[status].movies;
        const tvShows = stats.byStatus[status].tvShows;
        const time = formatTime(stats.byStatus[status].time);
        
        doc.fillColor('#6b7280')
           .text(`${status.charAt(0).toUpperCase() + status.slice(1)}:`, 300, statusY + statusOffset)
           .fillColor('#111827')
           .text(`Movies: ${movies}, TV: ${tvShows}, Time: ${time}`, 380, statusY + statusOffset);
        
        statusOffset += 20;
    });

    doc.moveDown(4);

    // Episode Statistics Section
    if (stats.episodeStats && stats.episodeStats.total > 0) {
        doc.addPage();
        
        doc.font('Helvetica-Bold')
           .fontSize(14)
           .fillColor('#1f2937')
           .text('Episode Statistics')
           .moveDown(0.5);
        
        const episodeY = doc.y;
        
        doc.font('Helvetica')
           .fontSize(11)
           .fillColor('#374151')
           .text('Total Episodes:', 50, episodeY)
           .fillColor('#111827')
           .text(`${stats.episodeStats.total}`, 200, episodeY);
        
        doc.fillColor('#374151')
           .text('Watched Episodes:', 50, episodeY + 20)
           .fillColor('#111827')
           .text(`${stats.episodeStats.watched} (${((stats.episodeStats.watched / stats.episodeStats.total) * 100).toFixed(1)}%)`, 200, episodeY + 20);
        
        doc.fillColor('#374151')
           .text('Skipped Episodes:', 50, episodeY + 40)
           .fillColor('#111827')
           .text(`${stats.episodeStats.skipped}`, 200, episodeY + 40);
        
        if (stats.episodeStats.averageRating > 0) {
            doc.fillColor('#374151')
               .text('Average Episode Rating:', 50, episodeY + 60)
               .fillColor('#111827')
               .text(`${stats.episodeStats.averageRating.toFixed(1)}/5`, 200, episodeY + 60);
        }
        
        doc.fillColor('#374151')
           .text('Total Episode Watch Time:', 50, episodeY + 80)
           .fillColor('#dc2626')
           .text(formatTime(stats.episodeStats.totalWatchTime), 200, episodeY + 80);
        
        doc.moveDown(5);

        // Currently Watching TV Shows with Episodes
        if (stats.tvShowEpisodes && stats.tvShowEpisodes.length > 0) {
            const watchingShows = stats.tvShowEpisodes.filter((show: any) => show.status === "watching");
            
            if (watchingShows.length > 0) {
                doc.font('Helvetica-Bold')
                   .fontSize(14)
                   .fillColor('#1f2937')
                   .text('Currently Watching TV Shows')
                   .moveDown(0.5);
                
                let showY = doc.y;
                
                watchingShows.forEach((show: any, showIndex: number) => {
                    // Check if we need a new page
                    if (showY > doc.page.height - 200) {
                        doc.addPage();
                        showY = 50;
                    }
                    
                    doc.font('Helvetica-Bold')
                       .fontSize(12)
                       .fillColor('#dc2626')
                       .text(`${showIndex + 1}. ${show.showTitle}`, 50, showY);
                    
                    doc.font('Helvetica')
                       .fontSize(10)
                       .fillColor('#6b7280')
                       .text(`Watched ${show.totalWatched}/${show.totalEpisodes} episodes`, 50, showY + 18);
                    
                    let episodeY = showY + 40;
                    
                    // List watched episodes
                    show.watchedEpisodes.forEach((episode: any) => {
                        if (episodeY > doc.page.height - 100) {
                            doc.addPage();
                            episodeY = 50;
                        }
                        
                        doc.font('Helvetica')
                           .fontSize(9)
                           .fillColor('#374151')
                           .text(`S${episode.season}E${episode.episode}: ${episode.title}`, 70, episodeY)
                           .fillColor('#6b7280')
                           .text(`${episode.runtime} min | ${formatDate(episode.date)}`, 350, episodeY);
                        
                        episodeY += 16;
                    });
                    
                    showY = episodeY + 20;
                    doc.moveDown(1);
                });
            }

            doc.moveDown(2);

            // Completed TV Shows with Episodes
            const completedShows = stats.tvShowEpisodes.filter((show: any) => show.status === "completed");
            
            if (completedShows.length > 0) {
                doc.font('Helvetica-Bold')
                   .fontSize(14)
                   .fillColor('#1f2937')
                   .text('Completed TV Shows')
                   .moveDown(0.5);
                
                let completedShowY = doc.y;
                
                completedShows.forEach((show: any, showIndex: number) => {
                    // Check if we need a new page
                    if (completedShowY > doc.page.height - 200) {
                        doc.addPage();
                        completedShowY = 50;
                    }
                    
                    doc.font('Helvetica-Bold')
                       .fontSize(12)
                       .fillColor('#059669')
                       .text(`${showIndex + 1}. ${show.showTitle}`, 50, completedShowY);
                    
                    doc.font('Helvetica')
                       .fontSize(10)
                       .fillColor('#6b7280')
                       .text(`Completed ${show.totalWatched}/${show.totalEpisodes} episodes`, 50, completedShowY + 18);
                    
                    let episodeY = completedShowY + 40;
                    
                    // List last 5 watched episodes (or all if less than 5)
                    const episodesToShow = show.watchedEpisodes.slice(-5);
                    
                    episodesToShow.forEach((episode: any) => {
                        if (episodeY > doc.page.height - 100) {
                            doc.addPage();
                            episodeY = 50;
                        }
                        
                        doc.font('Helvetica')
                           .fontSize(9)
                           .fillColor('#374151')
                           .text(`S${episode.season}E${episode.episode}: ${episode.title}`, 70, episodeY)
                           .fillColor('#6b7280')
                           .text(`${episode.runtime} min | ${formatDate(episode.date)}`, 350, episodeY);
                        
                        episodeY += 16;
                    });
                    
                    completedShowY = episodeY + 20;
                    doc.moveDown(1);
                });
            }
        }
    }

    // Completed Movies Section
    if (stats.completedMovies && stats.completedMovies.length > 0) {
        doc.addPage();
        
        doc.font('Helvetica-Bold')
           .fontSize(14)
           .fillColor('#1f2937')
           .text('Completed Movies')
           .moveDown(0.5);
        
        let movieY = doc.y;
        
        stats.completedMovies.forEach((movie: any, index: number) => {
            // Check if we need a new page
            if (movieY > doc.page.height - 100) {
                doc.addPage();
                movieY = 50;
            }
            
            doc.font('Helvetica-Bold')
               .fontSize(12)
               .fillColor('#059669')
               .text(`${index + 1}. ${movie.title} (${movie.releaseYear})`, 50, movieY);
            
            doc.font('Helvetica')
               .fontSize(10)
               .fillColor('#6b7280')
               .text(`Watch Time: ${formatTime(movie.watchTime)}`, 70, movieY + 18);
            
            if (movie.rating && movie.rating !== "Not rated") {
                doc.fillColor('#f59e0b') // Amber for rating
                   .text(`Rating: ${movie.rating}/5`, 200, movieY + 18);
            }
            
            doc.fillColor('#6b7280')
               .text(`Completed: ${formatDate(movie.completedDate)}`, 300, movieY + 18);
            
            movieY += 40;
        });
    }

    // Footer
    const totalPages = doc.bufferedPageRange().count;
    
    for (let i = 0; i < totalPages; i++) {
        doc.switchToPage(i);
        
        doc.font('Helvetica')
           .fontSize(8)
           .fillColor('#6b7280')
           .text(
               `Page ${i + 1} of ${totalPages} • Cinetime Media Report • Generated on ${new Date().toLocaleDateString()}`,
               50,
               doc.page.height - 50,
               { align: 'center' }
           );
    }
};