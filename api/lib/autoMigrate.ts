import mysql from "mysql2/promise";
import { env } from "./env";
import { parseDatabaseUrl } from "./dbConfig";

async function tableExists(conn: mysql.Connection, tableName: string): Promise<boolean> {
  const [rows] = await conn.execute(
    "SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?",
    [tableName]
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function ensureTable(
  conn: mysql.Connection,
  tableName: string,
  createSql: string
) {
  if (await tableExists(conn, tableName)) {
    console.log(`[migrate] Table '${tableName}' already exists`);
    return;
  }
  console.log(`[migrate] Creating table '${tableName}'...`);
  await conn.execute(createSql);
  if (await tableExists(conn, tableName)) {
    console.log(`[migrate] Table '${tableName}' created successfully`);
  } else {
    throw new Error(`Table '${tableName}' was not created despite successful execute`);
  }
}

export async function runAutoMigrate() {
  if (!env.databaseUrl) {
    console.log("[migrate] DATABASE_URL not set, skipping migration");
    return;
  }

  const config = parseDatabaseUrl(env.databaseUrl);
  console.log(
    `[migrate] Connecting to ${config.host}:${config.port} as ${config.user}, ssl=${config.ssl ? "enabled" : "disabled"}`
  );

  let conn: mysql.Connection | null = null;
  try {
    conn = await mysql.createConnection(config);
    console.log("[migrate] Connected to database, running auto-migration...");

    await ensureTable(
      conn,
      "users",
      `
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        password VARCHAR(255),
        avatar VARCHAR(500),
        location VARCHAR(100) DEFAULT 'Shanghai',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `
    );

    await ensureTable(
      conn,
      "user_preferences",
      `
      CREATE TABLE IF NOT EXISTS user_preferences (
        id INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
        user_id INT NOT NULL,
        genres JSON,
        artists JSON,
        moods JSON,
        radio_mode BOOLEAN DEFAULT FALSE,
        mood_preset VARCHAR(50) DEFAULT 'Chill',
        intensity FLOAT DEFAULT 0.5,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `
    );

    await ensureTable(
      conn,
      "play_history",
      `
      CREATE TABLE IF NOT EXISTS play_history (
        id INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
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
    `
    );

    await ensureTable(
      conn,
      "chat_messages",
      `
      CREATE TABLE IF NOT EXISTS chat_messages (
        id INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
        user_id INT NOT NULL,
        sender VARCHAR(10) NOT NULL,
        text TEXT NOT NULL,
        type VARCHAR(20) DEFAULT 'text',
        recommendation_json TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `
    );

    await ensureTable(
      conn,
      "netease_sessions",
      `
      CREATE TABLE IF NOT EXISTS netease_sessions (
        id INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
        user_id INT NOT NULL,
        cookie TEXT NOT NULL,
        netease_uid VARCHAR(50),
        nickname VARCHAR(255),
        avatar VARCHAR(500),
        phone VARCHAR(20),
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `
    );

    console.log("[migrate] Auto-migration completed successfully");
  } catch (err: any) {
    console.error("[migrate] Migration failed:", err.message);

    if (err.code === "ER_ACCESS_DENIED_ERROR" && config.host.includes("tidbcloud.com")) {
      console.error("");
      console.error("═══════════════════════════════════════════════════════════════");
      console.error("  TiDB Cloud Connection Failed - Authentication Error");
      console.error("═══════════════════════════════════════════════════════════════");
      console.error("");
      console.error("This is NOT a code issue. Please check the following in TiDB Cloud:");
      console.error("");
      console.error("1. PASSWORD");
      console.error("   - Go to https://tidbcloud.com → your cluster → Connect → MySQL");
      console.error("   - Click 'Reset Password' or 'Generate Password'");
      console.error("   - Copy the NEW password and update your DATABASE_URL in Render");
      console.error("");
      console.error("2. IP ACCESS LIST (very common cause)");
      console.error("   - In TiDB Cloud, go to Security Settings → IP Access List");
      console.error("   - Add the Render outbound IP or use 0.0.0.0/0 to allow all IPs");
      console.error("   - Render's current IP:", "74.220.52.251");
      console.error("");
      console.error("3. DATABASE NAME");
      console.error("   - Ensure the database '", config.database, "' exists in your cluster");
      console.error("   - You can connect via TiDB Cloud's web SQL editor to verify");
      console.error("═══════════════════════════════════════════════════════════════");
    }

    throw err;
  } finally {
    if (conn) await conn.end();
  }
}
