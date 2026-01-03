import axios from 'axios';
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
      const response = await this.axiosInstance.get('/search/multi', {
        params: { query, page },
      });
      
      // Filter out items without media_type
      const filteredResults = response.data.results.filter((item: any) => 
        item.media_type === 'movie' || item.media_type === 'tv'
      );
      
      return {
        ...response.data,
        results: filteredResults
      };
    } catch (error: any) {
      console.error('TMDB Search Error:', error.message);
      throw new Error(`Failed to search TMDB: ${error.message}`);
    }
  }

  // Get movie details
  async getMovieDetails(movieId: number): Promise<TMDBMovieDetails> {
    try {
      const response = await this.axiosInstance.get(`/movie/${movieId}`, {
        params: {
          append_to_response: 'videos,credits,similar',
        },
      });
      
      return {
        ...response.data,
        runtime: response.data.runtime || 120,
        genres: response.data.genres || [],
        tagline: response.data.tagline || '',
        status: response.data.status || 'Released',
        budget: response.data.budget || 0,
        revenue: response.data.revenue || 0,
        homepage: response.data.homepage || '',
        imdb_id: response.data.imdb_id || '',
        media_type: 'movie' as const,
      };
    } catch (error: any) {
      console.error('TMDB Movie Details Error:', error.message);
      throw new Error(`Failed to fetch movie details: ${error.message}`);
    }
  }

  // Get TV show details
  async getTVDetails(tvId: number): Promise<any> {
    try {
      const response = await this.axiosInstance.get(`/tv/${tvId}`, {
        params: {
          append_to_response: 'videos,credits,similar',
        },
      });
      
      return {
        ...response.data,
        runtime: 45,
        media_type: 'tv' as const,
      };
    } catch (error: any) {
      console.error('TMDB TV Details Error:', error.message);
      throw new Error(`Failed to fetch TV details: ${error.message}`);
    }
  }

  // Get popular movies
  async getPopularMovies(page: number = 1): Promise<TMDBResponse> {
    try {
      const response = await this.axiosInstance.get('/movie/popular', {
        params: { page },
      });
      
      const resultsWithType = response.data.results.map((item: any) => ({
        ...item,
        media_type: 'movie' as const
      }));
      
      return {
        ...response.data,
        results: resultsWithType
      };
    } catch (error: any) {
      console.error('TMDB Popular Movies Error:', error.message);
      throw new Error(`Failed to fetch popular movies: ${error.message}`);
    }
  }

  // Get trending content
  async getTrending(timeWindow: 'day' | 'week' = 'week', page: number = 1): Promise<TMDBResponse> {
    try {
      const response = await this.axiosInstance.get(`/trending/all/${timeWindow}`, {
        params: { page },
      });
      
      const filteredResults = response.data.results
        .filter((item: any) => item.media_type === 'movie' || item.media_type === 'tv')
        .map((item: any) => {
          if (item.media_type === 'movie') {
            return {
              ...item,
              title: item.title || item.name || 'Unknown Movie',
              release_date: item.release_date || item.first_air_date || ''
            };
          } else {
            return {
              ...item,
              title: item.name || item.title || 'Unknown TV Show',
              release_date: item.first_air_date || item.release_date || ''
            };
          }
        });
      
      return {
        ...response.data,
        results: filteredResults
      };
    } catch (error: any) {
      console.error('TMDB Trending Error:', error.message);
      throw new Error(`Failed to fetch trending content: ${error.message}`);
    }
  }

  // Get movie genres
  async getMovieGenres(): Promise<{ id: number; name: string }[]> {
    try {
      const response = await this.axiosInstance.get('/genre/movie/list');
      return response.data.genres || [];
    } catch (error: any) {
      console.error('TMDB Genres Error:', error.message);
      throw new Error(`Failed to fetch genres: ${error.message}`);
    }
  }
  
  // Get TV season details
async getTVSeasonDetails(tvId: number, seasonNumber: number): Promise<any> {
  try {
    const response = await this.axiosInstance.get(`/tv/${tvId}/season/${seasonNumber}`);
    return response.data;
  } catch (error) {
    console.error("TMDB Season Details Error:", error);
    throw new Error("Failed to fetch season details");
  }
}

// Get all TV show seasons
async getTVSeasons(tvId: number): Promise<any> {
  try {
    const response = await this.axiosInstance.get(`/tv/${tvId}`);
    return {
      seasons: response.data.seasons,
      totalSeasons: response.data.number_of_seasons,
      totalEpisodes: response.data.number_of_episodes
    };
  } catch (error) {
    console.error("TMDB Seasons Error:", error);
    throw new Error("Failed to fetch TV seasons");
  }
}

// Search TV shows only
async searchTVShows(query: string, page: number = 1): Promise<TMDBResponse> {
  try {
    const response = await this.axiosInstance.get("/search/tv", {
      params: { query, page },
    });
    return response.data;
  } catch (error) {
    console.error("TMDB TV Search Error:", error);
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