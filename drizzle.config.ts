import type { Config } from "drizzle-kit";

export default {
  schema: "./gameplay_computer/schema.ts",
  out: "./migrations",
  driver: "turso",
  dbCredentials: {
    url: process.env.DB_URL!,
    authToken: process.env.DB_TOKEN!,
  },
} satisfies Config;
