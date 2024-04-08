import { z } from "npm:zod@3.22.4";
import { createClient } from "npm:@libsql/client/web";
import { drizzle } from "npm:drizzle-orm@0.30.7/libsql";
import { Hono } from "npm:hono@4.2.2";

import { GamePlayDB, schema } from "./gameplay_schema.ts";
import { app, GamePlayContext } from "./gameplay_web.tsx";
import { setupTracing, tracingMiddleware } from "./gameplay_tracing.ts";

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

const client = createClient({
  url: config.DB_URL,
  authToken: config.DB_TOKEN,
});

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

export default dev_app.fetch;
