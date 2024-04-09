import { z } from "zod";
import { createClient } from "libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { Hono } from "hono";

import { GamePlayDB, schema } from "./schema.ts";
import { app, GamePlayContext } from "./web.tsx";
import { setupTracing, tracedDbClient, tracingMiddleware } from "./tracing.ts";

const config = z
  .object({
    DB_URL: z.string(),
    DB_TOKEN: z.string(),
    CLERK_PUBLISHABLE_KEY: z.string(),
    CLERK_FRONTEND_API: z.string(),
    CLERK_JWT_KEY: z.string(),
    HONEYCOMB_API_KEY: z.string(),
  })
  .parse(Deno.env.toObject());

setupTracing(config.HONEYCOMB_API_KEY);

const base_client = createClient({
  url: config.DB_URL,
  authToken: config.DB_TOKEN,
});
const client = tracedDbClient(base_client);

const db: GamePlayDB = drizzle(client, { schema });

export const dev_app = new Hono();

dev_app.use(tracingMiddleware);
dev_app.use(async (c: GamePlayContext, next) => {
  c.set("db", db);
  c.set("clerk_publishable_key", config.CLERK_PUBLISHABLE_KEY);
  c.set("clerk_frontend_api", config.CLERK_FRONTEND_API);
  c.set("clerk_jwt_key", config.CLERK_JWT_KEY);
  await next();
});

dev_app.route("/", app);

Deno.serve(dev_app.fetch);
