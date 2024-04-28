/**
 * # Agent
 *
 * This module provides a way to create agents for games.
 *
 * Agents are http services that get POSTed a game state and return an action.
 * If you define your agent with {@link Connect4Agent} or {@link PokerAgent},
 * then you can use {@link agentHandler} to create an http service that
 * serves it. The service it creates is a standard fetch handler that can be
 * used with a variety of different http server libraries.
 *
 * For Example
 *
 * ## Deno
 *
 * ```ts
 * import { agentHandler } from "@gameplay/games/agent";
 * import { myConnect4Agent } from "./my_connect4_agent.ts";
 *
 * const handler = agentHandler([
 * { game: GameKind.Connect4, agentname: "my-agent", agent: myConnect4Agent },
 * ]});
 *
 * Deno.serve(handler);
 * ```
 *
 * ## Val.Town
 *
 * ```ts
 * import { agentHandler } from "@gameplay/games/agent";
 * import { myConnect4Agent } from "./my_connect4_agent.ts";
 *
 * const handler = agentHandler([
 * { game: GameKind.Connect4, agentname: "my-agent", agent: myConnect4Agent },
 * ]});
 *
 * export default handler;
 * ```
 *
 * ## Bun
 *
 * ```ts
 * import { agentHandler } from "@gameplay/games/agent";
 * import { myConnect4Agent } from "./my_connect4_agent.ts";
 *
 * const handler = agentHandler([
 * { game: GameKind.Connect4, agentname: "my-agent", agent: myConnect4Agent },
 * ]});
 *
 * Bun.serve({fetch: handler});
 * ```
 *
 * More than one agent can be registered so you can have multiple agents served
 * by the same http service.
 *
 * You must host your own agent service and make sure it's publically
 * accessible. You could use a service like Vercel, Cloudflare Workers, or
 * Deno Deploy. The best and easiest way to host your agent service is to use
 * val.town.
 *
 * You can also write your own agent service that implements the same http
 * interface as {@link agentHandler}. This means you can use python or go or any
 * other language to write your agent service, but you don't get the benefit of
 * having all the game logic that you do by writing your agent in javascript or
 * typescript and using this library.
 *
 * @module
 */

import type { Connect4Agent, Connect4AsyncAgent } from "./connect4.ts";
import type { GameKind, Json } from "./mod.ts";
import type { PokerAgent, PokerAsyncAgent } from "./poker.ts";

/**
 * A Connect4 Agent
 *
 * @template T The type of the agent data.
 * * Must extend {@link Json} which restricts it to a JSON serializable type.
 */
export interface Connect4AgentSpec<
  T extends Json = Json,
> {
  game: GameKind.Connect4;
  /** The name of the agent. */
  agentname: string;
  /** The agent function. */
  agent: Connect4Agent<T> | Connect4AsyncAgent<T>;
}

/**
 * A Poker Agent
 *
 * @template T The type of the agent data.
 * * Must extend {@link Json} which restricts it to a JSON serializable type.*
 */
export interface PokerAgentSpec<
  T extends Json = Json,
> {
  game: GameKind.Poker;
  /** The name of the agent. */
  agentname: string;
  /** The agent function. */
  agent: PokerAgent<T> | PokerAsyncAgent<T>;
}

/**
 * Type to register agents.
 *
 * @template T The type of the agent data.
 * * Must extend {@link Json} which restricts it to a JSON serializable type.
 */
export type AgentSpec<
  T extends Json = Json,
> = Connect4AgentSpec<T> | PokerAgentSpec<T>;

/**
 * Create standard fetch handler for an agent.
 *
 * Takes a list of agents and returns a handler that can be used to create an
 * agent http endpoint.
 * The handler implements the standard fetch interface and can be used with
 * a variety of different http server libraries.
 *
 * To see how to write the agent functions,
 * see the {@link Connect4Agent} and {@link PokerAgent}
 *
 * @template T The type of the agent data.
 * * Must extend {@link Json} which restricts it to a JSON serializable type.
 *
 * @param {AgentSpec[]} agents - The agents to register.
 * Multiple agents can be registered so you can have multiple agents served by
 * the same http service.
 *
 * @returns {(req: Request) => Promise<Response>} An async handler that can be
 * used with an http server that supports the fetch interface.
 */
export function agentHandler<
  T extends Json = Json,
>(
  agents: AgentSpec<T>[],
): (req: Request) => Promise<Response> {
  return async function (request: Request): Promise<Response> {
    if (request.method === "GET") {
      return Response.json({
        agents: agents.map((a) => {
          return { game: a.game, agent: a.agentname };
        }),
      });
    }

    if (request.method === "POST") {
      const body = await request.json();
      console.log(body);
      const game = body.game;
      const agentname = body.agentname;
      const state = body.state;
      const agent_data = body.agent_data;
      const agentSpec = agents.find((a) =>
        a.game === game && a.agentname === agentname
      );
      if (!agentSpec) {
        return Response.json({ error: "Agent not found" }, { status: 404 });
      }
      try {
        const action = await agentSpec.agent(state, agent_data);
        return Response.json(action);
      } catch (e) {
        return Response.json({ error: e.message }, { status: 500 });
      }
    }

    return Response.json({ error: "Method not allowed" }, { status: 405 });
  };
}
