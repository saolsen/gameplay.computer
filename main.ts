import { z } from "zod";
import { drizzle } from "drizzle-orm/libsql";
import { Hono } from "hono";

import {
  setupTracing,
  TracedClient,
  tracingMiddleware,
} from "./gameplay_computer/tracing.ts";
import { GamePlayDB, schema } from "./gameplay_computer/schema.ts";
import { app, GamePlayContext } from "./gameplay_computer/web.tsx";
import { processTask } from "./gameplay_computer/tasks.ts";

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

const client = new TracedClient({
  url: config.DB_URL,
  authToken: config.DB_TOKEN,
});

const db: GamePlayDB = drizzle(client, { schema });
const kv = await Deno.openKv();

export const configured_app = new Hono();

configured_app.use(tracingMiddleware);
configured_app.use(async (c: GamePlayContext, next) => {
  c.set("db", db);
  c.set("kv", kv);
  c.set("clerk_publishable_key", config.CLERK_PUBLISHABLE_KEY);
  c.set("clerk_frontend_api", config.CLERK_FRONTEND_API);
  c.set("clerk_jwt_key", config.CLERK_JWT_KEY);
  await next();
});

configured_app.route("/", app);

kv.listenQueue(async (msg) => {
  await processTask(db, kv, msg);
});

Deno.serve(configured_app.fetch);
