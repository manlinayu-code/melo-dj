import mysql from "mysql2/promise";
import { env } from "./env";

export async function runAutoMigrate() {
  if (!env.databaseUrl) {
    console.log("[migrate] DATABASE_URL not set, skipping migration");
    return;
  }

  let conn: mysql.Connection | null = null;
  try {
    conn = await mysql.createConnection(env.databaseUrl);
    console.log("[migrate] Connected to database, running auto-migration...");

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        password VARCHAR(255),
        avatar VARCHAR(500),
        location VARCHAR(100) DEFAULT 'Shanghai',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS user_preferences (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        genres JSON,
        artists JSON,
        moods JSON,
        radio_mode BOOLEAN DEFAULT FALSE,
        mood_preset VARCHAR(50) DEFAULT 'Chill',
        intensity FLOAT DEFAULT 0.5,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS play_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        song_id VARCHAR(50) NOT NULL,
        title VARCHAR(255) NOT NULL,
        artist VARCHAR(255) NOT NULL,
        album VARCHAR(255),
        cover VARCHAR(500),
        duration INT,
        played_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        completed BOOLEAN DEFAULT FALSE
      )
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        sender VARCHAR(10) NOT NULL,
        text TEXT NOT NULL,
        type VARCHAR(20) DEFAULT 'text',
        recommendation_json TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS netease_sessions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        cookie TEXT NOT NULL,
        netease_uid VARCHAR(50),
        nickname VARCHAR(255),
        avatar VARCHAR(500),
        phone VARCHAR(20),
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    console.log("[migrate] Auto-migration completed successfully");
  } catch (err: any) {
    console.error("[migrate] Migration failed:", err.message);
    throw err;
  } finally {
    if (conn) await conn.end();
  }
}
