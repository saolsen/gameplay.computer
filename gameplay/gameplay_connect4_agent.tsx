import {
  Connect4Agent,
  Connect4AsyncAgent,
  Connect4State,
} from "./connect4.ts";
import { Hono } from "npm:hono";

export function connect4Agent(agent: Connect4Agent | Connect4AsyncAgent) {
  const app = new Hono();
  app.get("/", (c) => c.json("connect4 agent"));
  app.post("/", async (c) => {
    const body = await c.req.json();
    const parsed = Connect4State.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error }, 400);
    }
    const state = parsed.data;
    try {
      const action = await agent(state);
      return c.json(action);
    } catch (e) {
      return c.json({ error: e.message }, 500);
    }
  });
  return app.fetch;
}
