import axios, { AxiosResponse } from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = process.env.TMDB_BASE_URL || 'https://api.themoviedb.org/3';

export interface TMDBMovie {
    id: number;
    title: string;
    overview: string;
    poster_path: string;
    backdrop_path: string;
    release_date: string;
    vote_average: number;
    vote_count: number;
    genre_ids: number[];
    media_type: "movie" | "tv";
}

export interface TMDBMovieDetails extends TMDBMovie {
    runtime: number;
    genres: { id: number; name: string }[];
    tagline: string;
    status: string;
    budget: number;
    revenue: number;
    homepage: string;
    imdb_id: string;
}

export interface TMDBTVShow {
    id: number;
    name: string;
    overview: string;
    poster_path: string;
    backdrop_path: string;
    first_air_date: string;
    vote_average: number;
    vote_count: number;
    genre_ids: number[];
    media_type: "tv";
}

export interface TMDBResponse {
    page: number;
    results: (TMDBMovie | TMDBTVShow)[];
    total_pages: number;
    total_results: number;
}

// TMDB API response types
interface TMDBMovieDetailsResponse {
    id: number;
    title: string;
    overview: string;
    poster_path: string;
    backdrop_path: string;
    release_date: string;
    vote_average: number;
    vote_count: number;
    genre_ids?: number[];
    genres?: { id: number; name: string }[];
    runtime?: number;
    tagline?: string;
    status?: string;
    budget?: number;
    revenue?: number;
    homepage?: string;
    imdb_id?: string;
    [key: string]: any;
}

interface TMDBTVDetailsResponse {
    id: number;
    name: string;
    overview: string;
    poster_path: string;
    backdrop_path: string;
    first_air_date: string;
    vote_average: number;
    vote_count: number;
    genre_ids?: number[];
    number_of_seasons?: number;
    number_of_episodes?: number;
    episode_run_time?: number[];
    [key: string]: any;
}

interface TMDBMultiSearchResponse {
    page: number;
    results: Array<{
        id: number;
        title?: string;
        name?: string;
        overview: string;
        poster_path: string;
        backdrop_path: string;
        release_date?: string;
        first_air_date?: string;
        vote_average: number;
        vote_count: number;
        genre_ids: number[];
        media_type: "movie" | "tv" | "person";
    }>;
    total_pages: number;
    total_results: number;
}

interface TMDBPopularMoviesResponse {
    page: number;
    results: Array<{
        id: number;
        title: string;
        overview: string;
        poster_path: string;
        backdrop_path: string;
        release_date: string;
        vote_average: number;
        vote_count: number;
        genre_ids: number[];
    }>;
    total_pages: number;
    total_results: number;
}

interface TMDBTrendingResponse {
    page: number;
    results: Array<{
        id: number;
        title?: string;
        name?: string;
        overview: string;
        poster_path: string;
        backdrop_path: string;
        release_date?: string;
        first_air_date?: string;
        vote_average: number;
        vote_count: number;
        genre_ids: number[];
        media_type: "movie" | "tv";
    }>;
    total_pages: number;
    total_results: number;
}

interface TMDBGenresResponse {
    genres: { id: number; name: string }[];
}

interface TMDBSeasonResponse {
    episodes: Array<{
        episode_number: number;
        name: string;
        overview: string;
        air_date: string;
        runtime?: number;
        still_path?: string;
    }>;
    season_number: number;
    name: string;
    overview: string;
    air_date: string;
    [key: string]: any;
}

class TMDBService {
    private axiosInstance;

    constructor() {
        if (!TMDB_API_KEY) {
            throw new Error('TMDB_API_KEY is not configured in environment variables');
        }

        this.axiosInstance = axios.create({
            baseURL: TMDB_BASE_URL,
            params: {
                api_key: TMDB_API_KEY,
                language: 'en-US',
            },
        });
    }

    // Search movies and TV shows
    async search(query: string, page: number = 1): Promise<TMDBResponse> {
        try {
            const response = await this.axiosInstance.get<TMDBMultiSearchResponse>('/search/multi', {
                params: { query, page },
            });

            const data = response.data;
            
            // Filter out items without media_type
            const filteredResults = data.results.filter((item) =>
                item.media_type === 'movie' || item.media_type === 'tv'
            );

            // Transform to our format
            const results = filteredResults.map((item) => {
                if (item.media_type === 'movie') {
                    const movie: TMDBMovie = {
                        id: item.id,
                        title: item.title || '',
                        overview: item.overview,
                        poster_path: item.poster_path,
                        backdrop_path: item.backdrop_path,
                        release_date: item.release_date || '',
                        vote_average: item.vote_average,
                        vote_count: item.vote_count,
                        genre_ids: item.genre_ids,
                        media_type: 'movie',
                    };
                    return movie;
                } else {
                    const tvShow: TMDBTVShow = {
                        id: item.id,
                        name: item.name || '',
                        overview: item.overview,
                        poster_path: item.poster_path,
                        backdrop_path: item.backdrop_path,
                        first_air_date: item.first_air_date || '',
                        vote_average: item.vote_average,
                        vote_count: item.vote_count,
                        genre_ids: item.genre_ids,
                        media_type: 'tv',
                    };
                    return tvShow;
                }
            });

            return {
                page: data.page,
                results: results,
                total_pages: data.total_pages,
                total_results: data.total_results,
            };
        } catch (error: any) {
            console.error('TMDB Search Error:', error.message);
            throw new Error(`Failed to search TMDB: ${error.message}`);
        }
    }

    // Get movie details
    async getMovieDetails(movieId: number): Promise<TMDBMovieDetails> {
        try {
            const response = await this.axiosInstance.get<TMDBMovieDetailsResponse>(`/movie/${movieId}`, {
                params: {
                    append_to_response: 'videos,credits,similar',
                },
            });

            const data = response.data;
            return {
                id: data.id,
                title: data.title,
                overview: data.overview,
                poster_path: data.poster_path,
                backdrop_path: data.backdrop_path,
                release_date: data.release_date,
                vote_average: data.vote_average,
                vote_count: data.vote_count,
                genre_ids: data.genre_ids || [],
                media_type: 'movie',
                runtime: data.runtime || 120,
                genres: data.genres || [],
                tagline: data.tagline || '',
                status: data.status || 'Released',
                budget: data.budget || 0,
                revenue: data.revenue || 0,
                homepage: data.homepage || '',
                imdb_id: data.imdb_id || '',
            };
        } catch (error: any) {
            console.error('TMDB Movie Details Error:', error.message);
            throw new Error(`Failed to fetch movie details: ${error.message}`);
        }
    }

    // Get TV show details
    async getTVDetails(tvId: number): Promise<any> {
        try {
            const response = await this.axiosInstance.get<TMDBTVDetailsResponse>(`/tv/${tvId}`, {
                params: {
                    append_to_response: 'videos,credits,similar',
                },
            });

            const data = response.data;
            return {
                id: data.id,
                name: data.name,
                title: data.name, // Also include as title for consistency
                overview: data.overview,
                poster_path: data.poster_path,
                backdrop_path: data.backdrop_path,
                first_air_date: data.first_air_date,
                release_date: data.first_air_date, // Also include as release_date
                vote_average: data.vote_average,
                vote_count: data.vote_count,
                genre_ids: data.genre_ids || [],
                runtime: 45,
                media_type: 'tv',
                number_of_seasons: data.number_of_seasons,
                number_of_episodes: data.number_of_episodes,
                episode_run_time: data.episode_run_time,
            };
        } catch (error: any) {
            console.error('TMDB TV Details Error:', error.message);
            throw new Error(`Failed to fetch TV details: ${error.message}`);
        }
    }

    // Get popular movies
    async getPopularMovies(page: number = 1): Promise<TMDBResponse> {
        try {
            const response = await this.axiosInstance.get<TMDBPopularMoviesResponse>('/movie/popular', {
                params: { page },
            });

            const data = response.data;
            
            const resultsWithType: TMDBMovie[] = data.results.map((item) => ({
                id: item.id,
                title: item.title,
                overview: item.overview,
                poster_path: item.poster_path,
                backdrop_path: item.backdrop_path,
                release_date: item.release_date,
                vote_average: item.vote_average,
                vote_count: item.vote_count,
                genre_ids: item.genre_ids,
                media_type: 'movie',
            }));

            return {
                page: data.page,
                results: resultsWithType,
                total_pages: data.total_pages,
                total_results: data.total_results,
            };
        } catch (error: any) {
            console.error('TMDB Popular Movies Error:', error.message);
            throw new Error(`Failed to fetch popular movies: ${error.message}`);
        }
    }

    // Get trending content
    async getTrending(timeWindow: 'day' | 'week' = 'week', page: number = 1): Promise<TMDBResponse> {
        try {
            const response = await this.axiosInstance.get<TMDBTrendingResponse>(`/trending/all/${timeWindow}`, {
                params: { page },
            });

            const data = response.data;
            
            const filteredResults = data.results
                .filter((item) => item.media_type === 'movie' || item.media_type === 'tv');

            const results: (TMDBMovie | TMDBTVShow)[] = filteredResults.map((item) => {
                if (item.media_type === 'movie') {
                    const movie: TMDBMovie = {
                        id: item.id,
                        title: item.title || item.name || 'Unknown Movie',
                        overview: item.overview,
                        poster_path: item.poster_path,
                        backdrop_path: item.backdrop_path,
                        release_date: item.release_date || item.first_air_date || '',
                        vote_average: item.vote_average,
                        vote_count: item.vote_count,
                        genre_ids: item.genre_ids,
                        media_type: 'movie',
                    };
                    return movie;
                } else {
                    const tvShow: TMDBTVShow = {
                        id: item.id,
                        name: item.name || item.title || 'Unknown TV Show',
                        overview: item.overview,
                        poster_path: item.poster_path,
                        backdrop_path: item.backdrop_path,
                        first_air_date: item.first_air_date || item.release_date || '',
                        vote_average: item.vote_average,
                        vote_count: item.vote_count,
                        genre_ids: item.genre_ids,
                        media_type: 'tv',
                    };
                    return tvShow;
                }
            });

            return {
                page: data.page,
                results: results,
                total_pages: data.total_pages,
                total_results: data.total_results,
            };
        } catch (error: any) {
            console.error('TMDB Trending Error:', error.message);
            throw new Error(`Failed to fetch trending content: ${error.message}`);
        }
    }

    // Get movie genres
    async getMovieGenres(): Promise<{ id: number; name: string }[]> {
        try {
            const response = await this.axiosInstance.get<TMDBGenresResponse>('/genre/movie/list');
            const data = response.data;
            return data.genres || [];
        } catch (error: any) {
            console.error('TMDB Genres Error:', error.message);
            throw new Error(`Failed to fetch genres: ${error.message}`);
        }
    }

    // Get TV season details
    async getTVSeasonDetails(tvId: number, seasonNumber: number): Promise<any> {
        try {
            const response = await this.axiosInstance.get<TMDBSeasonResponse>(`/tv/${tvId}/season/${seasonNumber}`);
            const data = response.data;
            return data;
        } catch (error: any) {
            console.error("TMDB Season Details Error:", error.message);

            // Return empty episode data if season doesn't exist
            if (error.response?.status === 404) {
                return {
                    episodes: [],
                    season_number: seasonNumber,
                    name: `Season ${seasonNumber}`,
                    overview: '',
                    air_date: ''
                };
            }

            throw new Error(`Failed to fetch season ${seasonNumber} details: ${error.message}`);
        }
    }

    // Get all TV show seasons
    async getTVSeasons(tvId: number): Promise<any> {
        try {
            const response = await this.axiosInstance.get<TMDBTVDetailsResponse>(`/tv/${tvId}`);
            const data = response.data;
            return {
                seasons: data,
                totalSeasons: data.number_of_seasons || 0,
                totalEpisodes: data.number_of_episodes || 0
            };
        } catch (error: any) {
            console.error("TMDB Seasons Error:", error.message);
            throw new Error("Failed to fetch TV seasons");
        }
    }

    // Search TV shows only
    async searchTVShows(query: string, page: number = 1): Promise<TMDBResponse> {
        try {
            const response = await this.axiosInstance.get<TMDBMultiSearchResponse>("/search/tv", {
                params: { query, page },
            });

            const data = response.data;
            
            const results: TMDBTVShow[] = data.results.map((item) => ({
                id: item.id,
                name: item.name || '',
                overview: item.overview,
                poster_path: item.poster_path,
                backdrop_path: item.backdrop_path,
                first_air_date: item.first_air_date || '',
                vote_average: item.vote_average,
                vote_count: item.vote_count,
                genre_ids: item.genre_ids,
                media_type: 'tv',
            }));

            return {
                page: data.page,
                results: results,
                total_pages: data.total_pages,
                total_results: data.total_results,
            };
        } catch (error: any) {
            console.error("TMDB TV Search Error:", error.message);
            throw new Error("Failed to search TV shows");
        }
    }

    // Get image URL helper
    getImageUrl(path: string | null, size: 'w92' | 'w154' | 'w185' | 'w342' | 'w500' | 'w780' | 'original' = 'w500'): string {
        if (!path) return '';
        return `https://image.tmdb.org/t/p/${size}${path}`;
    }
}

export default new TMDBService();