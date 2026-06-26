import {
  pgTable,
  serial,
  varchar,
  text,
  timestamp,
  integer,
  jsonb,
  boolean,
  real,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  password: varchar("password", { length: 255 }),
  avatar: varchar("avatar", { length: 500 }),
  location: varchar("location", { length: 100 }).default("Shanghai"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const userPreferences = pgTable(
  "user_preferences",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    genres: jsonb("genres").$type<string[]>(),
    artists: jsonb("artists").$type<string[]>(),
    moods: jsonb("moods").$type<string[]>(),
    radioMode: boolean("radio_mode").default(false),
    moodPreset: varchar("mood_preset", { length: 50 }).default("Chill"),
    intensity: real("intensity").default(0.5),
    language: varchar("language", { length: 8 }).default("zh"),
    ttsVoice: varchar("tts_voice", { length: 64 }),
    ttsProvider: varchar("tts_provider", { length: 16 }).default("auto"),
    theme: varchar("theme", { length: 16 }).default("dark"),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => ({
    userIdIdx: uniqueIndex("user_preferences_user_id_idx").on(t.userId),
  })
);

export const playHistory = pgTable(
  "play_history",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    songId: varchar("song_id", { length: 50 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    artist: varchar("artist", { length: 255 }).notNull(),
    album: varchar("album", { length: 255 }),
    cover: varchar("cover", { length: 500 }),
    duration: integer("duration"),
    playedAt: timestamp("played_at").notNull().defaultNow(),
    completed: boolean("completed").default(false),
  },
  (t) => ({
    userPlayedIdx: index("play_history_user_played_idx").on(t.userId, t.playedAt),
  })
);

export const playQueue = pgTable(
  "play_queue",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    position: integer("position").notNull(),
    trackId: varchar("track_id", { length: 64 }),
    neteaseId: integer("netease_id"),
    trackTitle: varchar("track_title", { length: 255 }).notNull(),
    artist: varchar("artist", { length: 255 }).notNull(),
    album: varchar("album", { length: 255 }),
    sourceUrl: text("source_url"),
    coverUrl: text("cover_url"),
    durationSec: integer("duration_sec"),
    addedAt: timestamp("added_at").notNull().defaultNow(),
  },
  (t) => ({
    userPositionIdx: index("play_queue_user_position_idx").on(t.userId, t.position),
  })
);

export const chatMessages = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  sessionId: varchar("session_id", { length: 64 }),
  sender: varchar("sender", { length: 10 }).notNull(),
  text: text("text").notNull(),
  type: varchar("type", { length: 20 }).default("text"),
  recommendationJson: text("recommendation_json"),
  actionJson: text("action_json"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const neteaseSessions = pgTable(
  "netease_sessions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    cookie: text("cookie").notNull(),
    neteaseUid: varchar("netease_uid", { length: 50 }),
    nickname: varchar("nickname", { length: 255 }),
    avatar: varchar("avatar", { length: 500 }),
    phone: varchar("phone", { length: 20 }),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => ({
    userIdIdx: uniqueIndex("netease_sessions_user_id_idx").on(t.userId),
  })
);

export const moods = pgTable(
  "moods",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 50 }).notNull(),
    nameZh: varchar("name_zh", { length: 50 }).notNull(),
    description: text("description"),
    icon: varchar("icon", { length: 50 }).notNull(),
    color: varchar("color", { length: 20 }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    nameIdx: uniqueIndex("moods_name_idx").on(t.name),
  })
);

export const trackMoods = pgTable(
  "track_moods",
  {
    id: serial("id").primaryKey(),
    neteaseId: integer("netease_id").notNull(),
    moodId: integer("mood_id").notNull(),
    confidence: real("confidence").default(1.0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    neteaseMoodIdx: uniqueIndex("track_moods_netease_mood_idx").on(t.neteaseId, t.moodId),
    moodIdx: index("track_moods_mood_idx").on(t.moodId),
  })
);

// Local enriched track metadata cache — populated via playlist import.
// Solves Issue #3: Netease search doesn't return genre; we enrich from
// playlist tags (proxy-genre) + song_detail (pop, publishTime).
export const localTracks = pgTable(
  "local_tracks",
  {
    id: serial("id").primaryKey(),
    neteaseId: integer("netease_id").notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    artist: varchar("artist", { length: 255 }).notNull(),
    album: varchar("album", { length: 255 }),
    coverUrl: varchar("cover_url", { length: 500 }),
    durationSec: integer("duration_sec"),
    genre: jsonb("genre").$type<string[]>(),
    pop: integer("pop"),
    publishTime: integer("publish_time"),
    sourcePlaylistId: integer("source_playlist_id"),
    sourcePlaylistName: varchar("source_playlist_name", { length: 255 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => ({
    neteaseIdIdx: uniqueIndex("local_tracks_netease_id_idx").on(t.neteaseId),
    playlistIdx: index("local_tracks_playlist_idx").on(t.sourcePlaylistId),
  })
);

// Cross-platform track identity mapping + sync state.
// neteaseId is the canonical local key; spotifyId is reserved for future.
// neteaseLiked = reverse sync (pulled from Netease liked list)
// meloFav = forward sync (user clicked heart in Melo DJ)
export const trackSync = pgTable(
  "track_sync",
  {
    id: serial("id").primaryKey(),
    neteaseId: integer("netease_id").notNull(),
    spotifyId: varchar("spotify_id", { length: 50 }),
    neteaseLiked: boolean("netease_liked").default(false),
    meloFav: boolean("melo_fav").default(false),
    lastSyncedAt: timestamp("last_synced_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => ({
    neteaseIdIdx: uniqueIndex("track_sync_netease_id_idx").on(t.neteaseId),
    spotifyIdIdx: index("track_sync_spotify_id_idx").on(t.spotifyId),
  })
);
