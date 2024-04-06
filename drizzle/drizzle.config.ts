import type { Config } from 'drizzle-kit';

export default {
  schema: './schema.ts',
  out: './migrations',
  driver: 'better-sqlite',
  dbCredentials: {
    url: "./gameplay.db",
  },
} satisfies Config;