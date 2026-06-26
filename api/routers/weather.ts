import { z } from "zod";
import { createRouter, publicQuery } from "../middleware";
import axios from "axios";

// =============================================================
// QWeather (新版开发平台)
//   Host: {凭据ID}.qweatherapi.com
//   Auth: X-QW-Api-Key: {API_KEY}
// Legacy fallback: devapi.qweather.com / api.qweather.com (key= param)
// =============================================================
const RAW_API_HOST = process.env.WEATHER_API_HOST || "";
// Auto-append .qweatherapi.com if user only provided credential ID
const QWEATHER_API_HOST = RAW_API_HOST.includes(".")
  ? RAW_API_HOST
  : RAW_API_HOST
    ? `${RAW_API_HOST}.qweatherapi.com`
    : "";
const QWEATHER_API_KEY = process.env.WEATHER_API_KEY || "";

const LEGACY_WEATHER_BASES = [
  "https://devapi.qweather.com/v7",
  "https://api.qweather.com/v7",
];
const LEGACY_GEO_BASES = [
  "https://geoapi.qweather.com/v2",
  "https://api.qweather.com/geo/v2",
];

function getWeatherBases(): string[] {
  if (QWEATHER_API_HOST) {
    return [`https://${QWEATHER_API_HOST}/v7`, ...LEGACY_WEATHER_BASES];
  }
  return LEGACY_WEATHER_BASES;
}

function getGeoBases(): string[] {
  if (QWEATHER_API_HOST) {
    return [`https://${QWEATHER_API_HOST}/geo/v2`, ...LEGACY_GEO_BASES];
  }
  return LEGACY_GEO_BASES;
}

function isCustomHost(base: string): boolean {
  return !!QWEATHER_API_HOST && base.includes(QWEATHER_API_HOST);
}

const conditionMap: Record<string, string> = {
  "100": "sunny", "101": "cloudy", "102": "cloudy", "103": "cloudy",
  "200": "windy", "201": "windy", "202": "windy",
  "300": "rainy", "301": "rainy", "302": "rainy", "303": "rainy",
  "304": "rainy", "305": "rainy", "306": "rainy", "307": "rainy",
  "310": "rainy", "311": "rainy", "312": "rainy", "313": "rainy",
  "400": "snowy", "401": "snowy", "402": "snowy", "403": "snowy",
  "404": "snowy", "405": "snowy", "406": "snowy", "407": "snowy",
  "500": "foggy", "501": "foggy", "502": "foggy",
  "800": "clear", "801": "clear", "802": "clear", "803": "clear",
};

function isDayFromIcon(icon: string): boolean {
  // QWeather icon codes ending in 'n' are night; everything else day.
  // Codes are numeric strings, but some legacy variants append 'd'/'n'.
  if (!icon) return true;
  return !icon.endsWith("n");
}

// =============================================================
// Cache — 60s TTL, keyed by quantized lat,lng (or location id).
// Holds the last known good value so we can serve stale on outage.
// =============================================================
type NormalizedWeather = {
  tempC: number | null;
  condition: string;
  conditionCode: string;
  humidity: number | null;
  windKph: number | null;
  isDay: boolean;
  text: string;
  city: string;
  // raw legacy fields kept for back-compat with frontend
  temp: number;
  wind: string;
  icon: string;
};

type CacheEntry = { value: NormalizedWeather; storedAt: number };
const CACHE_TTL_MS = 60 * 1000;
const weatherCache = new Map<string, CacheEntry>();

function cacheKeyFromInput(input: {
  location?: string;
  lat?: number;
  lng?: number;
}): string {
  if (typeof input.lat === "number" && typeof input.lng === "number") {
    return `${input.lat.toFixed(2)},${input.lng.toFixed(2)}`;
  }
  return input.location || "default";
}

function cacheGetFresh(key: string): NormalizedWeather | null {
  const hit = weatherCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.storedAt > CACHE_TTL_MS) return null;
  return hit.value;
}

function cacheGetStale(key: string): NormalizedWeather | null {
  const hit = weatherCache.get(key);
  return hit?.value ?? null;
}

function cacheSet(key: string, value: NormalizedWeather): void {
  weatherCache.set(key, { value, storedAt: Date.now() });
}

// =============================================================
// Normalizer — turns raw QWeather `now` into the canonical shape.
// =============================================================
function normalize(rawData: {
  now: Record<string, string>;
  location?: { name?: string };
}): NormalizedWeather {
  const now = rawData.now || ({} as Record<string, string>);
  const icon = now.icon || "";
  const tempStr = now.temp;
  const humidityStr = now.humidity;
  const windKphStr = now.windSpeed; // QWeather returns km/h in windSpeed

  const tempC = tempStr !== undefined && tempStr !== "" ? parseFloat(tempStr) : null;
  const humidity =
    humidityStr !== undefined && humidityStr !== "" ? parseInt(humidityStr, 10) : null;
  const windKph =
    windKphStr !== undefined && windKphStr !== "" ? parseFloat(windKphStr) : null;

  const condition = conditionMap[icon] || "cloudy";

  return {
    tempC: Number.isFinite(tempC ?? NaN) ? tempC : null,
    condition,
    conditionCode: icon,
    humidity: Number.isFinite(humidity ?? NaN) ? humidity : null,
    windKph: Number.isFinite(windKph ?? NaN) ? windKph : null,
    isDay: isDayFromIcon(icon),
    text: now.text || "",
    city: rawData.location?.name || "",
    // legacy back-compat
    temp: Number.isFinite(tempC ?? NaN) ? Math.round(tempC as number) : 18,
    wind: `${now.windDir || ""} ${now.windScale || ""}级`.trim(),
    icon,
  };
}

const FALLBACK: NormalizedWeather = {
  tempC: null,
  condition: "unknown",
  conditionCode: "",
  humidity: null,
  windKph: null,
  isDay: true,
  text: "",
  city: "",
  temp: 18,
  wind: "",
  icon: "",
};

// =============================================================
// Fetcher with multi-host fallback. Returns null on total failure.
// =============================================================
async function fetchWeatherNow(location: string): Promise<NormalizedWeather | null> {
  if (!QWEATHER_API_KEY) return null;
  const bases = getWeatherBases();
  let lastErr: unknown = null;

  for (const base of bases) {
    const useHeaderAuth = isCustomHost(base);
    try {
      const res = await axios.get(`${base}/weather/now`, {
        params: useHeaderAuth ? { location } : { location, key: QWEATHER_API_KEY },
        headers: useHeaderAuth ? { "X-QW-Api-Key": QWEATHER_API_KEY } : {},
        timeout: 8000,
      });
      const data = res.data;
      if (data.code !== "200" && data.code !== 200) {
        throw new Error(data.message || `Weather API error code=${data.code}`);
      }
      return normalize(data);
    } catch (err) {
      lastErr = err;
      const errAny = err as { response?: { data?: { error?: { type?: string } } }; message?: string };
      console.error(
        `[weather] ${base} failed:`,
        errAny?.response?.data || errAny?.message || err,
      );
      // Custom host: any error → try legacy fallbacks too.
      // Legacy host: only continue iterating on invalid-host class errors.
      if (!useHeaderAuth) {
        const isInvalidHost = errAny?.response?.data?.error?.type?.includes("invalid-host");
        if (!isInvalidHost) break;
      }
    }
  }

  console.error("[weather] all endpoints failed; lastErr=", (lastErr as Error)?.message || lastErr);
  return null;
}

export const weatherRouter = createRouter({
  current: publicQuery
    .input(
      z
        .object({
          location: z.string().optional(),
          lat: z.number().optional(),
          lng: z.number().optional(),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const location = input?.location || "101020100";
      const key = cacheKeyFromInput({ location, lat: input?.lat, lng: input?.lng });

      // 1) Fresh cache.
      const fresh = cacheGetFresh(key);
      if (fresh) {
        return shapeLegacyResponse(true, fresh);
      }

      // 2) No key → return demo fallback (back-compat with previous behaviour).
      if (!QWEATHER_API_KEY) {
        return shapeLegacyResponse(false, {
          ...FALLBACK,
          tempC: 18,
          condition: "rainy",
          text: "小雨",
          city: "Shanghai",
          humidity: 78,
          temp: 18,
          wind: "3级",
        });
      }

      // 3) Live fetch.
      const live = await fetchWeatherNow(location);
      if (live) {
        cacheSet(key, live);
        return shapeLegacyResponse(true, live);
      }

      // 4) Total failure → stale cache if any.
      const stale = cacheGetStale(key);
      if (stale) {
        console.warn("[weather] serving stale cache for", key);
        return shapeLegacyResponse(true, stale);
      }

      // 5) Bottom-most fallback. Never throw.
      return shapeLegacyResponse(false, FALLBACK);
    }),

  cityLookup: publicQuery
    .input(z.object({ query: z.string() }))
    .query(async ({ input }) => {
      if (!QWEATHER_API_KEY) return { success: false, cities: [] };
      const bases = getGeoBases();
      let lastErr: unknown = null;

      for (const base of bases) {
        const useHeaderAuth = isCustomHost(base);
        try {
          const res = await axios.get(`${base}/city/lookup`, {
            params: useHeaderAuth
              ? { location: input.query, number: 5 }
              : { location: input.query, key: QWEATHER_API_KEY, number: 5 },
            headers: useHeaderAuth ? { "X-QW-Api-Key": QWEATHER_API_KEY } : {},
            timeout: 8000,
          });
          const data = res.data;
          if (data.code !== "200" && data.code !== 200) return { success: false, cities: [] };

          return {
            success: true,
            cities: ((data.location || []) as Array<Record<string, string>>).map((loc) => ({
              id: loc.id,
              name: loc.name,
              country: loc.country,
              adm1: loc.adm1,
            })),
          };
        } catch (err) {
          lastErr = err;
          const errAny = err as { response?: { data?: { error?: { type?: string } } }; message?: string };
          console.error(
            `[weather/cityLookup] ${base} failed:`,
            errAny?.response?.data || errAny?.message || err,
          );
          if (!useHeaderAuth) {
            const isInvalidHost = errAny?.response?.data?.error?.type?.includes("invalid-host");
            if (!isInvalidHost) break;
          }
        }
      }
      console.error("[weather/cityLookup] all failed; last=", (lastErr as Error)?.message || lastErr);
      return { success: false, cities: [] };
    }),
});

// =============================================================
// Legacy response shape — keeps existing AppContext consumers happy
// while also exposing the new normalized fields. Frontend reads
// `success`, `temp`, `condition`, `text`, `city`, `wind`, `humidity`,
// `icon` today (see src/context/AppContext.tsx fetchWeather).
// =============================================================
function shapeLegacyResponse(success: boolean, n: NormalizedWeather) {
  return {
    success,
    // legacy fields
    temp: n.temp,
    condition: n.condition,
    text: n.text || (n.condition === "unknown" ? "" : ""),
    city: n.city || "Shanghai",
    wind: n.wind,
    humidity: n.humidity ?? 50,
    icon: n.icon,
    // normalized fields
    tempC: n.tempC,
    conditionCode: n.conditionCode,
    windKph: n.windKph,
    isDay: n.isDay,
  };
}
