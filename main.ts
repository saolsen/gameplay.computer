import { z } from "npm:zod@3.22.4";
import { drizzle } from "npm:drizzle-orm@0.30.7/libsql";
import { Hono } from "npm:hono@4.2.2";

import {
  setupTracing,
  TracedClient,
  tracingMiddleware,
} from "./gameplay_computer/tracing.ts";
import { GamePlayDB, schema } from "./gameplay_computer/schema.ts";
import { app, GamePlayContext, processTask } from "./gameplay_computer/web.tsx";

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

// note: this always returns the current value first.
//const stream = kv.watch([["match", "foo"]]);
//for await (const event of stream) {
//  console.log("watch", event);
//}

Deno.serve(configured_app.fetch);

// So. If I'm going to run on deno deploy. I can still use turso but I can
// also use some of the other stuff that's hella useful.
// the queue to do background jobs.
// kv to do pub/sub.
// sse to live listen to the match updates.

// Means things are no longer compatible with val.town but I think that is
// ok.
// having a queue lets me completely drop the lock crap.
// using kv and sse gives a way better experience for the live updates.

// there's still a good chance subhosting would be better than deno deploy.
