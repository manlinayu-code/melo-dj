import postgres from "postgres";
import { env } from "./env";

/**
 * Lightweight auto-migration for PostgreSQL/Supabase.
 * Schema DDL is handled by drizzle-kit push (render.yaml preDeployCommand).
 * This script only handles data seeding that drizzle-kit doesn't cover.
 */
export async function runAutoMigrate() {
  if (env.skipAutoMigrate) {
    console.log("[migrate] SKIP_AUTO_MIGRATE=1, skipping auto-migration");
    return;
  }
  if (!env.databaseUrl) {
    console.log("[migrate] DATABASE_URL not set, skipping migration");
    return;
  }

  console.log("[migrate] Connecting to PostgreSQL...");
  const sql = postgres(env.databaseUrl);

  try {
    // Check if moods table exists (schema was pushed by drizzle-kit)
    const tableCheck = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'moods'
      )
    `;
    const moodsExists = tableCheck[0]?.exists || false;

    if (!moodsExists) {
      console.log("[migrate] Moods table not found — run db:push first. Skipping seed.");
      return;
    }

    // Seed default moods if table is empty
    const [countRow] = await sql`SELECT COUNT(*)::int as cnt FROM moods`;
    if (countRow.cnt === 0) {
      console.log("[migrate] Seeding default moods...");
      await sql`
        INSERT INTO moods (name, name_zh, description, icon, color) VALUES
        ('Calm', '平静', '舒缓、放松的纯音乐或氛围音乐', 'wind', '#8b5cf6'),
        ('Chill', '慵懒', '爵士、R&B、沙发音乐，适合放松', 'coffee', '#f59e0b'),
        ('Energetic', '动感', '摇滚、电子、流行，高能量节奏', 'zap', '#ef4444'),
        ('Heartbreak', '情伤', '民谣、抒情、走心的叙事歌曲', 'heart', '#ec4899'),
        ('Focus', '专注', '古典、器乐、极简主义，适合工作学习', 'brain', '#3b82f6')
      `;
      console.log("[migrate] Default moods seeded");
    } else {
      console.log(`[migrate] Moods table has ${countRow.cnt} rows, skipping seed`);
    }

    console.log("[migrate] Auto-migration completed");
  } catch (err: any) {
    console.error("[migrate] Migration failed:", err.message);
    throw err;
  } finally {
    await sql.end();
  }
}
