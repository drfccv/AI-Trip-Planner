import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./drizzle-pg",
  schema: "./db/schema.ts",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:5432/ai_trip_planner" },
});
