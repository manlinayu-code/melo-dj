export interface DbConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl?: {
    rejectUnauthorized: boolean;
    minVersion?: string;
  };
}

export function parseDatabaseUrl(url: string): DbConfig {
  try {
    const parsed = new URL(url);

    if (parsed.protocol !== "mysql:") {
      throw new Error(`Unsupported database protocol: ${parsed.protocol}`);
    }

    const host = parsed.hostname;
    const port = parseInt(parsed.port || "3306", 10);
    const user = decodeURIComponent(parsed.username);
    const password = decodeURIComponent(parsed.password);
    const database = parsed.pathname.replace(/^\//, "");

    const isTiDB = host.includes("tidbcloud.com");
    const isPlanetScale = host.includes("psdb.cloud");

    const config: DbConfig = {
      host,
      port,
      user,
      password,
      database,
    };

    // TiDB Cloud 和 PlanetScale 强制要求 SSL
    if (isTiDB || isPlanetScale) {
      config.ssl = {
        rejectUnauthorized: true,
        minVersion: "TLSv1.2",
      };
    } else if (process.env.DB_SSL === "true") {
      config.ssl = { rejectUnauthorized: true };
    } else if (process.env.DB_SSL === "false") {
      // 显式禁用 SSL
    } else {
      // 默认：对非本地主机启用 SSL
      const isLocal =
        host === "localhost" ||
        host === "127.0.0.1" ||
        host.startsWith("192.168.") ||
        host.startsWith("10.") ||
        host.startsWith("172.");
      if (!isLocal) {
        config.ssl = { rejectUnauthorized: true };
      }
    }

    return config;
  } catch (err) {
    throw new Error(
      `Failed to parse DATABASE_URL: ${(err as Error).message}`
    );
  }
}
