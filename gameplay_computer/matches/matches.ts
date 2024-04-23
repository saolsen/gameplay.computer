import { z } from "zod";
import { Uuid25 } from "uuid25";
import { uuidv7obj } from "uuidv7";
import { and, eq, or } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";

import {
  GameError,
  GameKind,
  Json,
  Player,
  PlayerKind,
  Status,
  Unreachable,
} from "../games/game.ts";
import {
  Connect4,
  Connect4Action,
  Connect4State,
} from "../games/connect4/connect4.ts";

import { trace, traced, tracedFetch } from "../tracing.ts";
import {
  Action,
  AgentId,
  GamePlayDB,
  MatchId,
  NotAllowed,
  NotFound,
  schema,
  SelectUser,
  Todo,
  UserId,
} from "../schema.ts";
import { fetchUserByUsername } from "../users.ts";
import { fetchAgentByUsernameAndAgentname } from "../agents/agents.ts";
import { Poker, PokerAction, PokerState } from "../games/poker/poker.ts";

export function matchId(): MatchId {
  return `m_${Uuid25.fromBytes(uuidv7obj().bytes).value}` as MatchId;
}

export const NewConnect4Action = z.object({
  game: z.literal("connect4"),
  action: Connect4Action,
});
export type NewConnect4Action = z.infer<typeof NewConnect4Action>;

export const NewPokerAction = z.object({
  game: z.literal("poker"),
  action: PokerAction,
});
export type NewPokerAction = z.infer<typeof NewPokerAction>;

export const NewAction = z.discriminatedUnion("game", [
  NewConnect4Action,
  NewPokerAction,
]);
export type NewAction = z.infer<typeof NewAction>;

export const Connect4Turn = z.object({
  turn_number: z.number(),
  player_number: z.number().nullable(),
  action: Connect4Action.nullable(),
});
export type Connect4Turn = z.infer<typeof Connect4Turn>;

export const Connect4CurrentTurn = z.object({
  turn_number: z.number(),
  status: Status,
  state: Connect4State,
});
export type Connect4CurrentTurn = z.infer<typeof Connect4CurrentTurn>;

export const Connect4MatchView = z.object({
  match_id: MatchId,
  game: z.literal("connect4"),
  turn_number: z.number(),
  players: z.array(Player),
  turns: z.array(Connect4Turn),
  current_turn: Connect4CurrentTurn,
});
export type Connect4MatchView = z.infer<typeof Connect4MatchView>;

export const PokerTurn = z.object({
  turn_number: z.number(),
  player_number: z.number().nullable(),
  action: PokerAction.nullable(),
});
export type PokerTurn = z.infer<typeof PokerTurn>;

export const PokerCurrentTurn = z.object({
  turn_number: z.number(),
  status: Status,
  state: PokerState,
});
export type PokerCurrentTurn = z.infer<typeof PokerCurrentTurn>;

export const PokerMatchView = z.object({
  match_id: MatchId,
  game: z.literal("poker"),
  turn_number: z.number(),
  players: z.array(Player),
  turns: z.array(PokerTurn),
  current_turn: PokerCurrentTurn,
});
export type PokerMatchView = z.infer<typeof PokerMatchView>;

export const MatchView = z.discriminatedUnion("game", [
  Connect4MatchView,
  PokerMatchView,
]);
export type MatchView = z.infer<typeof MatchView>;

export const fetchMatchById = traced(
  "fetchMatchById",
  _fetchMatchById,
);
async function _fetchMatchById(
  db: GamePlayDB,
  match_id: MatchId,
): Promise<MatchView | NotFound> {
  const agent_user = alias(schema.users, "agent_user");
  const results = await db.batch([
    db
      .select({
        match_id: schema.matches.match_id,
        game: schema.matches.game,
        turn_number: schema.matches.turn_number,
      })
      .from(schema.matches)
      .where(eq(schema.matches.match_id, match_id)),
    db
      .select({
        player_number: schema.match_players.player_number,
        player_kind: schema.match_players.player_kind,
        user_id: schema.match_players.user_id,
        agent_id: schema.match_players.agent_id,
        username: schema.users.username,
        agentname: schema.agents.agentname,
        agent_username: agent_user.username,
      })
      .from(schema.match_players)
      .where(eq(schema.match_players.match_id, match_id))
      .leftJoin(
        schema.users,
        eq(schema.match_players.user_id, schema.users.user_id),
      )
      .leftJoin(
        schema.agents,
        eq(schema.match_players.agent_id, schema.agents.agent_id),
      )
      .leftJoin(
        agent_user,
        eq(schema.agents.user_id, agent_user.user_id),
      ),
    db
      .select({
        turn_number: schema.match_turns.turn_number,
        player_number: schema.match_turns.player_number,
        action: schema.match_turns.action,
      })
      .from(schema.match_turns)
      .where(eq(schema.match_turns.match_id, match_id)),
    db
      .select()
      .from(schema.match_turns)
      .innerJoin(
        schema.matches,
        eq(schema.match_turns.match_id, schema.matches.match_id),
      )
      .where(
        and(
          eq(schema.match_turns.match_id, match_id),
          eq(schema.matches.turn_number, schema.match_turns.turn_number),
        ),
      ),
  ]);

  if (results[0].length === 0) {
    return new NotFound("match", match_id);
  }

  const match = results[0][0];
  const players = results[1];
  const turns = results[2];
  const current_turn = results[3][0].match_turns;

  players.sort((a, b) => a.player_number - b.player_number);
  turns.sort((a, b) => a.turn_number - b.turn_number);

  const game = GameKind.parse(match.game);

  switch (game) {
    case "connect4": {
      return {
        match_id: match.match_id,
        game: "connect4",
        turn_number: match.turn_number,
        players: players.map((player) => {
          switch (player.player_kind) {
            case "user": {
              return {
                kind: "user",
                username: player.username!,
              };
            }
            case "agent": {
              return {
                kind: "agent",
                username: player.agent_username!,
                agentname: player.agentname!,
              };
            }
            default: {
              throw new Unreachable(player.player_kind);
            }
          }
        }),
        turns: turns.map((turn) => ({
          turn_number: turn.turn_number,
          player_number: turn.player_number,
          action: turn.action as Connect4Action | null,
        })),
        current_turn: {
          turn_number: current_turn.turn_number,
          status: current_turn.status as Status,
          state: current_turn.state as Connect4State,
        },
      };
    }
    case "poker": {
      return {
        match_id: match.match_id,
        game: "poker",
        turn_number: match.turn_number,
        players: players.map((player) => {
          switch (player.player_kind) {
            case "user": {
              return {
                kind: "user",
                username: player.username!,
              };
            }
            case "agent": {
              return {
                kind: "agent",
                username: player.agent_username!,
                agentname: player.agentname!,
              };
            }
            default: {
              throw new Unreachable(player.player_kind);
            }
          }
        }),
        turns: turns.map((turn) => ({
          turn_number: turn.turn_number,
          player_number: turn.player_number,
          action: turn.action as PokerAction | null,
        })),
        current_turn: {
          turn_number: current_turn.turn_number,
          status: current_turn.status as Status,
          state: current_turn.state as PokerState,
        },
      };
    }
    default: {
      throw new Unreachable(game);
    }
  }
}

export const UserMatch = z.object({
  match_id: MatchId,
  status: Status,
  active_player: z.boolean(),
});
export type UserMatch = z.infer<typeof UserMatch>;

export const findMatchesForGameAndUser = traced(
  "findMatchesForGameAndUser",
  _findMatchesForGameAndUser,
);
async function _findMatchesForGameAndUser(
  db: GamePlayDB,
  game: GameKind,
  user_id: UserId,
): Promise<UserMatch[]> {
  const result = await db
    .select({
      match_id: schema.matches.match_id,
      player_number: schema.match_players.player_number,
      status: schema.match_turns.status,
    })
    .from(schema.matches)
    .innerJoin(
      schema.match_turns,
      and(
        eq(schema.matches.match_id, schema.match_turns.match_id),
        eq(schema.matches.turn_number, schema.match_turns.turn_number),
      ),
    )
    .innerJoin(
      schema.match_players,
      eq(schema.matches.match_id, schema.match_players.match_id),
    )
    .where(
      and(
        eq(schema.matches.game, game),
        or(
          eq(schema.match_players.user_id, user_id),
          eq(schema.matches.created_by, user_id),
        ),
      ),
    );

  const matches = new Map();
  for (const row of result) {
    if (!matches.has(row.match_id)) {
      matches.set(row.match_id, {
        match_id: row.match_id,
        status: row.status,
        active_player: false,
      });
    }
    const match = matches.get(row.match_id);
    match.active_player = match.active_player ||
      (row.status.status === "in_progress" &&
        row.status.active_player === row.player_number);
  }

  return Array.from(matches.values());
}

export const createMatch = traced("createMatch", _createMatch);
async function _createMatch(
  db: GamePlayDB,
  kv: Deno.Kv,
  created_by: SelectUser,
  players: Player[],
  game: GameKind,
): Promise<
  | { match_id: MatchId; first_player_agent: boolean }
  | NotFound
  | NotAllowed
  | GameError
> {
  const player_ids: {
    player_kind: PlayerKind;
    user_id: UserId | null;
    agent_id: AgentId | null;
  }[] = [];
  for (const player of players) {
    switch (player.kind) {
      case "user": {
        const user = await fetchUserByUsername(db, player.username);
        if (user instanceof NotFound) {
          return new NotFound("user", player.username);
        }
        player_ids.push({
          player_kind: player.kind,
          user_id: user.user_id,
          agent_id: null,
        });
        break;
      }
      case "agent": {
        const agent = await fetchAgentByUsernameAndAgentname(
          db,
          player.username,
          player.agentname,
        );
        if (agent instanceof NotFound) {
          return new NotFound(
            "agent",
            player.username + "/" + player.agentname,
          );
        }
        player_ids.push({
          player_kind: player.kind,
          user_id: null,
          agent_id: agent.agent_id,
        });
        break;
      }
      default: {
        throw new Unreachable(player);
      }
    }
  }

  // TODO: Check any rules for creating a match.

  // Create the new game state.
  let state;
  let status;
  switch (game) {
    case "connect4": {
      const result = Connect4.newGame({ players });
      if (result instanceof GameError) {
        return result;
      }
      [state, status] = result;
      if (status.status !== "in_progress") {
        return new GameError("state", "New game is not in progress.");
      }
      break;
    }
    case "poker": {
      const result = Poker.newGame({ players });
      if (result instanceof GameError) {
        return result;
      }
      [state, status] = result;
      if (status.status !== "in_progress") {
        return new GameError("state", "New game is not in progress.");
      }
      break;
    }
    default: {
      throw new Unreachable(game);
    }
  }

  // Create the new match records.
  const match_id = matchId();
  await db.batch([
    db.insert(schema.matches).values({
      match_id,
      game,
      created_by: created_by.user_id,
      turn_number: 0,
    }),
    db.insert(schema.match_players).values([
      ...players.map((_player, i) => ({
        match_id,
        player_number: i,
        player_kind: player_ids[i].player_kind,
        user_id: player_ids[i].user_id,
        agent_id: player_ids[i].agent_id,
      })),
    ]),
    db.insert(schema.match_turns).values({
      match_id,
      turn_number: 0,
      status_kind: status.status,
      status,
      player_number: null,
      action: null,
      state,
    }),
  ]);

  await kv.set(["match_turn", match_id], 0);
  return {
    match_id,
    first_player_agent: players[status.active_player].kind === "agent",
  };
}

export const takeMatchUserTurn = traced(
  "takeMatchUserTurn",
  _takeMatchUserTurn,
);
export async function _takeMatchUserTurn(
  db: GamePlayDB,
  kv: Deno.Kv,
  user: SelectUser,
  match_id: MatchId,
  action: NewAction,
): Promise<boolean | NotFound | NotAllowed | GameError> {
  const match_view = await fetchMatchById(db, match_id);
  if (match_view instanceof NotFound) {
    return match_view;
  }

  if (match_view.current_turn.status.status !== "in_progress") {
    return new GameError("state", "Match is not in progress.");
  }

  const player_i = match_view.current_turn.status.active_player;
  const player = match_view.players[player_i];
  if (player.kind !== "user") {
    throw new Todo("Agent players.");
  }
  if (player.username !== user.username) {
    return new NotAllowed(
      user.user_id,
      "match",
      match_id,
      "User is not the active player.",
    );
  }

  const state = match_view.current_turn.state;

  let new_status;
  switch (match_view.game) {
    case "connect4": {
      const action_check = trace(
        "Connect4.checkAction",
        Connect4.checkAction,
        state as Connect4State,
        player_i,
        action.action as Connect4Action,
      );
      if (action_check instanceof GameError) {
        return action_check;
      }
      new_status = trace(
        "Connect4.applyAction",
        Connect4.applyAction,
        state as Connect4State,
        player_i,
        action.action as Connect4Action,
      );
      if (new_status instanceof GameError) {
        return new_status;
      }
      break;
    }
    case "poker": {
      const action_check = trace(
        "Poker.checkAction",
        Poker.checkAction,
        state as PokerState,
        player_i,
        action.action as PokerAction,
      );
      if (action_check instanceof GameError) {
        return action_check;
      }
      new_status = trace(
        "Poker.applyAction",
        Poker.applyAction,
        state as PokerState,
        player_i,
        action.action as PokerAction,
      );
      if (new_status instanceof GameError) {
        return new_status;
      }
      break;
    }
    default: {
      throw new Unreachable(match_view);
    }
  }

  // Update the match.
  try {
    await db.batch([
      db
        .update(schema.matches)
        .set({
          turn_number: match_view.turn_number + 1,
        })
        .where(eq(schema.matches.match_id, match_id)),
      db.insert(schema.match_turns).values({
        match_id,
        turn_number: match_view.turn_number + 1,
        status_kind: new_status.status,
        status: new_status,
        player_number: player_i,
        action,
        state,
      }),
    ]);
  } catch (e) {
    console.error(e);
    // todo: how do you really catch this?
    if (e.message.includes("SQLITE_CONSTRAINT")) {
      // Turn was already taken.
      return false;
    } else {
      throw e;
    }
  }

  await kv.set(["match_turn", match_id], match_view.turn_number + 1);
  return true;
}

// take an agent's turn.
// returns true if the next turn is an agent's turn too.
export const takeMatchAgentTurn = traced(
  "takeMatchAgentTurn",
  _takeMatchAgentTurn,
);
export async function _takeMatchAgentTurn(
  db: GamePlayDB,
  kv: Deno.Kv,
  match_id: MatchId,
): Promise<boolean | NotFound | NotAllowed | GameError> {
  const match_view = await fetchMatchById(db, match_id);
  if (match_view instanceof NotFound) {
    return match_view;
  }

  if (match_view.current_turn.status.status !== "in_progress") {
    return false;
  }

  const player_i = match_view.current_turn.status.active_player;
  const player = match_view.players[player_i];
  if (player.kind !== "agent") {
    return false;
  }

  const agent = await fetchAgentByUsernameAndAgentname(
    db,
    player.username,
    player.agentname,
  );
  if (agent instanceof NotFound) {
    return new NotFound("agent", player.username + "/" + player.agentname);
  }

  // todo: check agent status.

  const state = match_view.current_turn.state;

  // Query the agent for the action.
  let response: { kind: "error"; reason: string } | { kind: "ok"; json: Json };
  try {
    const resp = await tracedFetch(agent.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(state),
    });

    if (!resp.ok) {
      response = {
        kind: "error",
        reason:
          `Agent '${agent.slug}' returned ${resp.status} ${resp.statusText}`,
      };
    } else {
      try {
        response = { kind: "ok", json: await resp.json() };
      } catch (_e) {
        response = {
          kind: "error",
          reason: `Agent '${agent.slug}' returned invalid JSON`,
        };
      }
    }
  } catch (_e) {
    response = { kind: "error", reason: `Error Calling Agent '${agent.slug}'` };
  }

  let action: Action | null = null;
  let new_status: Status;

  if (response.kind === "error") {
    new_status = {
      status: "over",
      result: {
        kind: "errored",
        reason: response.reason,
      },
    };
  } else {
    switch (match_view.game) {
      case "connect4": {
        const check_action = Connect4Action.safeParse(response.json);
        if (!check_action.success) {
          new_status = {
            status: "over",
            result: {
              kind: "errored",
              reason: `Agent '${agent.slug}' returned invalid action ${
                JSON.stringify(response.json)
              }`,
            },
          };
          break;
        }

        action = { game: "connect4", action: check_action.data };

        const action_check = trace(
          "Connect4.checkAction",
          Connect4.checkAction,
          state as Connect4State,
          player_i,
          action.action,
        );
        if (action_check instanceof GameError) {
          new_status = {
            status: "over",
            result: {
              kind: "errored",
              reason: `Agent '${agent.slug}' returned illegal action ${
                JSON.stringify(response)
              }`,
            },
          };
          break;
        }

        const new_s = trace(
          "Connect4.applyAction",
          Connect4.applyAction,
          state as Connect4State,
          player_i,
          action.action,
        );
        if (new_s instanceof GameError) {
          // note: this shouldn't happen since we checked it above.
          new_status = {
            status: "over",
            result: {
              kind: "errored",
              reason: `Unexpected Error applying action ${new_s.message}`,
            },
          };
        } else {
          new_status = new_s;
        }
        break;
      }
      case "poker": {
        const check_action = PokerAction.safeParse(response.json);
        if (!check_action.success) {
          new_status = {
            status: "over",
            result: {
              kind: "errored",
              reason: `Agent '${agent.slug}' returned invalid action ${
                JSON.stringify(response.json)
              }`,
            },
          };
          break;
        }

        action = { game: "poker", action: check_action.data };

        const action_check = trace(
          "Poker.checkAction",
          Poker.checkAction,
          state as PokerState,
          player_i,
          action.action,
        );
        if (action_check instanceof GameError) {
          new_status = {
            status: "over",
            result: {
              kind: "errored",
              reason: `Agent '${agent.slug}' returned illegal action ${
                JSON.stringify(response)
              }`,
            },
          };
          break;
        }

        const new_s = trace(
          "Poker.applyAction",
          Poker.applyAction,
          state as PokerState,
          player_i,
          action.action,
        );
        if (new_s instanceof GameError) {
          // note: this shouldn't happen since we checked it above.
          new_status = {
            status: "over",
            result: {
              kind: "errored",
              reason: `Unexpected Error applying action ${new_s.message}`,
            },
          };
        } else {
          new_status = new_s;
        }
        break;
      }
      default: {
        throw new Unreachable(match_view);
      }
    }
  }

  // Update the match.
  await db.batch([
    db
      .update(schema.matches)
      .set({
        turn_number: match_view.turn_number + 1,
      })
      .where(eq(schema.matches.match_id, match_id)),
    db.insert(schema.match_turns).values({
      match_id,
      turn_number: match_view.turn_number + 1,
      status_kind: new_status.status,
      status: new_status,
      player_number: player_i,
      action,
      state,
    }),
  ]);

  await kv.set(["match_turn", match_id], match_view.turn_number + 1);

  if (
    new_status.status === "in_progress" &&
    match_view.players[new_status.active_player].kind === "agent"
  ) {
    return true;
  }

  return false;
}
