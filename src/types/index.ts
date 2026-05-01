export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  cover: string;
  genre: string[];
  isFav: boolean;
  neteaseId?: number;
}

export interface DJProfile {
  name: string;
  avatar: string;
  tagline: string;
  bio: string;
  genres: string[];
  isOnline: boolean;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'dj';
  text: string;
  timestamp: number;
  type?: 'text' | 'action';
  recommendation?: {
    action: string;
    title: string;
    artist: string;
    reason: string;
    vibe_match: string;
  } | null;
}

export interface WeatherInfo {
  condition: 'sunny' | 'cloudy' | 'rainy' | 'snowy' | 'windy' | 'foggy' | 'clear';
  temp: number;
  city: string;
  text: string;
  wind: string;
  humidity: number;
}

export interface EnvVibe {
  mood: string;
  intensity: number;
  radioMode: boolean;
  immersed: boolean;
}

export interface UserTaste {
  topArtists: { name: string; count: number }[];
  topGenres: { name: string; count: number }[];
  totalTracks: number;
  totalPlays: number;
  diversity: number;
  dominantTime: string;
  energy: number;
  tasteProfile: {
    exploratory: string;
    loyalty: string;
    nocturnal: boolean;
  };
}

export type ViewType = 'home' | 'queue' | 'chat' | 'profile';
