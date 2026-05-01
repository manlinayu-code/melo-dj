import { z } from "zod";
import { createRouter, publicQuery } from "../middleware";
import axios from "axios";

const WEATHER_API_BASE = "https://devapi.qweather.com/v7";
const GEO_API_BASE = "https://geoapi.qweather.com/v2";

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
      const apiKey = process.env.WEATHER_API_KEY || "";
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

      try {
        const res = await axios.get(`${WEATHER_API_BASE}/weather/now`, {
          params: { location, key: apiKey },
          timeout: 10000,
        });

        const data = res.data;
        if (data.code !== "200") {
          throw new Error(data.message || "Weather API error");
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
        console.error("[weather] error:", err?.message || err);
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
    }),

  cityLookup: publicQuery
    .input(z.object({ query: z.string() }))
    .query(async ({ input }) => {
      const apiKey = process.env.WEATHER_API_KEY || "";
      if (!apiKey) return { success: false, cities: [] };

      try {
        const res = await axios.get(`${GEO_API_BASE}/city/lookup`, {
          params: { location: input.query, key: apiKey, number: 5 },
          timeout: 10000,
        });
        const data = res.data;
        if (data.code !== "200") return { success: false, cities: [] };

        return {
          success: true,
          cities: (data.location || []).map((loc: any) => ({
            id: loc.id,
            name: loc.name,
            country: loc.country,
            adm1: loc.adm1,
          })),
        };
      } catch {
        return { success: false, cities: [] };
      }
    }),
});
