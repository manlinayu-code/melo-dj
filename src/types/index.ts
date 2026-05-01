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

export interface Recommendation {
  action: string;
  title: string;
  artist: string;
  reason: string;
  vibe_match: string;
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
  sender: "user" | "dj";
  text: string;
  timestamp: number;
  type?: "text" | "action";
  recommendation?: Recommendation;
}

export interface WeatherInfo {
  condition: "sunny" | "cloudy" | "rainy" | "snowy" | "windy" | "foggy" | "clear";
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

export type ViewType = "home" | "queue" | "chat" | "profile";
