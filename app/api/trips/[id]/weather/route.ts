import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { tripDays, trips } from "@/db/schema";
import { requireRequestUser } from "@/lib/auth/request-user";
import { loadTrip } from "@/lib/trips/serialize";

const WEATHER_URL = "https://uapis.cn/api/v1/misc/weather";
type Forecast = {
  date: string;
  temp_max: number;
  temp_min: number;
  weather_day: string;
  weather_night: string;
  wind_dir_day?: string;
  wind_scale_day?: string;
  humidity?: number;
  precip?: number;
  uv_index?: number;
};
type WeatherResponse = {
  weather: string;
  temperature: number;
  wind_direction?: string;
  wind_power?: string;
  report_time: string;
  temp_max?: number;
  temp_min?: number;
  forecast?: Forecast[];
  aqi?: number;
  aqi_category?: string;
  alerts?: unknown[];
  life_indices?: {
    clothing?: { level?: string; brief?: string; advice?: string };
    umbrella?: { advice?: string };
    sunscreen?: { advice?: string };
    travel?: { advice?: string };
  };
  code?: string;
  message?: string;
};
class WeatherError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function queryWeather(city: string) {
  const apiKey = process.env.UAPI_API_KEY?.trim();
  if (apiKey && !apiKey.startsWith("uapi-"))
    throw new WeatherError("UAPI_KEY_INVALID_FORMAT", 503);
  const url = new URL(WEATHER_URL);
  url.searchParams.set("city", city);
  url.searchParams.set("forecast", "true");
  url.searchParams.set("extended", "true");
  url.searchParams.set("indices", "true");
  url.searchParams.set("lang", "zh");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: {
        accept: "application/json",
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      },
      cache: "no-store",
    });
    const data = (await response.json().catch(() => ({}))) as WeatherResponse;
    if (!response.ok) {
      if (response.status === 429)
        throw new WeatherError("UAPI_RATE_LIMITED", 429);
      if (response.status === 400)
        throw new WeatherError(data.code || "UAPI_INVALID_PARAMETER", 400);
      if (response.status === 404)
        throw new WeatherError("UAPI_CITY_NOT_FOUND", 404);
      if (response.status === 503)
        throw new WeatherError("UAPI_SERVICE_UNAVAILABLE", 503);
      throw new WeatherError(data.code || `UAPI_HTTP_${response.status}`, 502);
    }
    return data;
  } catch (error) {
    if (error instanceof WeatherError) throw error;
    if (error instanceof Error && error.name === "AbortError")
      throw new WeatherError("UAPI_TIMEOUT", 504);
    throw new WeatherError("UAPI_NETWORK_ERROR", 502);
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireRequestUser(request);
    const { id } = await context.params;
    const trip = (
      await getDb()
        .select()
        .from(trips)
        .where(and(eq(trips.id, id), eq(trips.userId, user.id)))
        .limit(1)
    )[0];
    if (!trip) throw new WeatherError("TRIP_NOT_FOUND", 404);
    if (!trip.startDate)
      return Response.json({
        trip: await loadTrip(id),
        unavailable: "FLEXIBLE_DATES",
      });
    const result = await queryWeather(trip.destination);
    const days = await getDb()
      .select()
      .from(tripDays)
      .where(eq(tripDays.tripId, id));
    const clothing = result.life_indices?.clothing;
    let updated = 0;
    for (const day of days) {
      const forecast = result.forecast?.find((item) => item.date === day.date);
      if (!forecast) continue;
      const advice =
        clothing?.advice ||
        [
          result.life_indices?.umbrella?.advice,
          result.life_indices?.sunscreen?.advice,
        ]
          .filter(Boolean)
          .join("；") ||
        "根据气温准备衣物，穿舒适步行鞋";
      await getDb()
        .update(tripDays)
        .set({
          weatherJson: JSON.stringify({
            weather: forecast.weather_day,
            weatherNight: forecast.weather_night,
            low: forecast.temp_min,
            high: forecast.temp_max,
            wind: [forecast.wind_dir_day, forecast.wind_scale_day]
              .filter(Boolean)
              .join(" "),
            humidity: forecast.humidity,
            precipitation: forecast.precip,
            uvIndex: forecast.uv_index,
            advice,
            clothingLevel: clothing?.level,
            aqi: result.aqi,
            aqiCategory: result.aqi_category,
            alerts: result.alerts || [],
            reportTime: result.report_time,
            provider: "UAPI",
            verifiedAt: new Date().toISOString(),
          }),
        })
        .where(eq(tripDays.id, day.id));
      updated++;
    }
    return Response.json({ trip: await loadTrip(id), updated });
  } catch (error) {
    const status = error instanceof WeatherError ? error.status : 500;
    return Response.json(
      {
        error: error instanceof Error ? error.message : "WEATHER_QUERY_FAILED",
      },
      { status },
    );
  }
}
