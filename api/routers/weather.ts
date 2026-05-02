import { z } from "zod";
import { createRouter, publicQuery } from "../middleware";
import axios from "axios";

// 新版和风天气 API (开发平台)
// Host: {凭据ID}.qweatherapi.com
// Auth Header: X-QW-Api-Key: {API_KEY}
const RAW_API_HOST = process.env.WEATHER_API_HOST || "";
// Auto-append .qweatherapi.com if user only provided credential ID
const QWEATHER_API_HOST = RAW_API_HOST.includes(".") ? RAW_API_HOST : RAW_API_HOST ? `${RAW_API_HOST}.qweatherapi.com` : "";
const QWEATHER_API_KEY = process.env.WEATHER_API_KEY || "";

// 旧版和风天气 API 回退
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
    return [`https://${QWEATHER_API_HOST}/v7`];
  }
  return LEGACY_WEATHER_BASES;
}

function getGeoBases(): string[] {
  if (QWEATHER_API_HOST) {
    return [`https://${QWEATHER_API_HOST}/geo/v2`];
  }
  return LEGACY_GEO_BASES;
}

function isNewApi(): boolean {
  return !!QWEATHER_API_HOST;
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

export const weatherRouter = createRouter({
  current: publicQuery
    .input(
      z
        .object({
          location: z.string().default("101020100"),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const apiKey = QWEATHER_API_KEY;
      const location = input?.location || "101020100";

      if (!apiKey) {
        return {
          success: false,
          temp: 18,
          condition: "rainy",
          text: "小雨",
          city: "Shanghai",
          wind: "3级",
          humidity: 78,
        };
      }

      const bases = getWeatherBases();
      const newApi = isNewApi();
      let lastErr: any = null;

      for (const base of bases) {
        try {
          const res = await axios.get(`${base}/weather/now`, {
            params: newApi ? { location } : { location, key: apiKey },
            headers: newApi ? { "X-QW-Api-Key": apiKey } : {},
            timeout: 10000,
          });

          const data = res.data;
          if (data.code !== "200" && data.code !== 200) {
            throw new Error(data.message || `Weather API error: ${JSON.stringify(data)}`);
          }

          const now = data.now;
          return {
            success: true,
            temp: parseInt(now.temp),
            condition: conditionMap[now.icon] || "cloudy",
            text: now.text,
            city: data.location?.name || "Shanghai",
            wind: `${now.windDir} ${now.windScale}级`,
            humidity: parseInt(now.humidity),
            icon: now.icon,
          };
        } catch (err: any) {
          lastErr = err;
          console.error(`[weather] ${base} failed:`, err?.response?.data || err?.message || err);
          if (!newApi) {
            const isInvalidHost = err?.response?.data?.error?.type?.includes("invalid-host");
            if (!isInvalidHost) break;
          }
        }
      }

      console.error("[weather] All endpoints failed. Last error:", lastErr?.message || lastErr);
      return {
        success: false,
        temp: 18,
        condition: "rainy",
        text: "小雨",
        city: "Shanghai",
        wind: "3级",
        humidity: 78,
      };
    }),

  cityLookup: publicQuery
    .input(z.object({ query: z.string() }))
    .query(async ({ input }) => {
      const apiKey = QWEATHER_API_KEY;
      if (!apiKey) return { success: false, cities: [] };

      const bases = getGeoBases();
      const newApi = isNewApi();
      let lastErr: any = null;

      for (const base of bases) {
        try {
          const res = await axios.get(`${base}/city/lookup`, {
            params: newApi
              ? { location: input.query, number: 5 }
              : { location: input.query, key: apiKey, number: 5 },
            headers: newApi ? { "X-QW-Api-Key": apiKey } : {},
            timeout: 10000,
          });
          const data = res.data;
          if (data.code !== "200" && data.code !== 200) return { success: false, cities: [] };

          return {
            success: true,
            cities: (data.location || []).map((loc: any) => ({
              id: loc.id,
              name: loc.name,
              country: loc.country,
              adm1: loc.adm1,
            })),
          };
        } catch (err: any) {
          lastErr = err;
          console.error(`[weather] ${base} failed:`, err?.response?.data || err?.message || err);
          if (!newApi) {
            const isInvalidHost = err?.response?.data?.error?.type?.includes("invalid-host");
            if (!isInvalidHost) break;
          }
        }
      }
      return { success: false, cities: [] };
    }),
});
