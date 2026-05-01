import {
  mysqlTable,
  serial,
  varchar,
  text,
  timestamp,
  int,
  json,
  boolean,
  float,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }),
  avatar: varchar("avatar", { length: 500 }),
  location: varchar("location", { length: 100 }).default("Shanghai"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const userPreferences = mysqlTable("user_preferences", {
  id: serial("id").primaryKey(),
  userId: int("user_id").notNull(),
  genres: json("genres").$type<string[]>(),
  artists: json("artists").$type<string[]>(),
  moods: json("moods").$type<string[]>(),
  radioMode: boolean("radio_mode").default(false),
  moodPreset: varchar("mood_preset", { length: 50 }).default("Chill"),
  intensity: float("intensity").default(0.5),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});

export const playHistory = mysqlTable("play_history", {
  id: serial("id").primaryKey(),
  userId: int("user_id").notNull(),
  songId: varchar("song_id", { length: 50 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  artist: varchar("artist", { length: 255 }).notNull(),
  album: varchar("album", { length: 255 }),
  cover: varchar("cover", { length: 500 }),
  duration: int("duration"),
  playedAt: timestamp("played_at").notNull().defaultNow(),
  completed: boolean("completed").default(false),
});

export const chatMessages = mysqlTable("chat_messages", {
  id: serial("id").primaryKey(),
  userId: int("user_id").notNull(),
  sender: varchar("sender", { length: 10 }).notNull(),
  text: text("text").notNull(),
  type: varchar("type", { length: 20 }).default("text"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
