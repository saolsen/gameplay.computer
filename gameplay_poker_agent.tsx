import { Hono } from "npm:hono@4.2.2";

import {
  PokerAction,
  PokerAgent,
  PokerAsyncAgent,
  PokerView,
} from "./gameplay_computer/games/poker/poker.ts";

export function pokerAgent(agent: PokerAgent | PokerAsyncAgent) {
  const app = new Hono();
  app.get("/", (c) => c.json("poker agent"));
  app.post("/", async (c) => {
    const body = await c.req.json();
    const parsed = PokerView.safeParse(body);
    if (!parsed.success) {
      console.log(parsed.error);
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
