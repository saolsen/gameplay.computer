import { Hono } from "npm:hono@4.2.2";
import { createClient } from "npm:@libsql/client/web";
import { drizzle } from "npm:drizzle-orm@0.30.7/libsql";

import { GamePlayDB, schema } from "./gameplay_schema.ts";
import { app, GamePlayContext } from "./gameplay_web.tsx";

const client = createClient({
  url: Deno.env.get("GAMEPLAY_DEV_DB_URL")!,
  authToken: Deno.env.get("GAMEPLAY_DEV_DB_TOKEN")!,
});

const db: GamePlayDB = drizzle(client, { schema });

export const dev_app = new Hono();

dev_app.use(async (c: GamePlayContext, next) => {
  c.set("db", db);
  c.set(
    "clerk_publishable_key",
    Deno.env.get("GAMEPLAY_DEV_CLERK_PUBLISHABLE_KEY")!,
  );
  c.set("clerk_frontend_api", Deno.env.get("GAMEPLAY_DEV_CLERK_FRONTEND_API")!);
  c.set("clerk_jwt_key", Deno.env.get("GAMEPLAY_DEV_CLERK_JWT_KEY")!);
  await next();
});

dev_app.route("/", app);

export default dev_app.fetch;
