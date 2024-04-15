import { z } from "npm:zod@3.22.4";
import { Uuid25 } from "npm:uuid25@0.1.4";
import { uuidv7obj } from "npm:uuidv7@0.6.3";
import { and, eq, gt, isNull, or, sql } from "npm:drizzle-orm@0.30.7";
import { alias } from "npm:drizzle-orm@0.30.7/sqlite-core";

import {
  GameError,
  GameKind,
  Player,
  PlayerKind,
  Status,
} from "../gameplay_game.ts";
import {
  Connect4,
  Connect4Action,
  Connect4State,
} from "../gameplay_connect4.ts";

import { trace, traced, tracedFetch } from "./tracing.ts";
import {
  AgentId,
  GamePlayDB,
  MatchId,
  NotAllowed,
  NotFound,
  schema,
  SelectUser,
  Todo,
  Unreachable,
  UserId,
} from "./schema.ts";
import { fetchUserByUsername } from "./users.ts";
import { fetchAgentByUsernameAndAgentname } from "./agents.ts";
import { queueTask } from "./tasks.ts";

export function matchId(): MatchId {
  return `m_${Uuid25.fromBytes(uuidv7obj().bytes).value}` as MatchId;
}

export const NewConnect4Action = z.object({
  game: z.literal("connect4"),
  action: Connect4Action,
});
export type NewConnect4Action = z.infer<typeof NewConnect4Action>;

export const NewAction = z.discriminatedUnion("game", [NewConnect4Action]);
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

export const MatchView = z.discriminatedUnion("game", [Connect4MatchView]);
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
        game: match.game,
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
        row.status.active_players.includes(row.player_number));
  }

  return Array.from(matches.values());
}

export const createMatch = traced("createMatch", _createMatch);
async function _createMatch(
  db: GamePlayDB,
  created_by: SelectUser,
  players: Player[],
  game: GameKind,
): Promise<MatchId | NotFound | NotAllowed | GameError> {
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
      state = Connect4.newGame({ players });
      if (state instanceof GameError) {
        return state;
      }
      status = Connect4.checkStatus(state);
      if (status instanceof GameError) {
        return status;
      }
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

  return match_id;
}

export const takeMatchUserTurn = traced(
  "takeMatchUserTurn",
  _takeMatchUserTurn,
);
export async function _takeMatchUserTurn(
  db: GamePlayDB,
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

  // note: hardcoded to one active player. Fix for multiple players.
  const player_i = match_view.current_turn.status.active_players[0];
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
        state,
        player_i,
        action.action,
      );
      if (action_check instanceof GameError) {
        return action_check;
      }
      new_status = trace(
        "Connect4.applyAction",
        Connect4.applyAction,
        state,
        player_i,
        action.action,
      );
      if (new_status instanceof GameError) {
        return new_status;
      }
      break;
    }
    default: {
      throw new Unreachable(match_view.game);
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
        action: action.action,
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
  return true;
}

export const takeMatchAgentTurn = traced(
  "takeMatchAgentTurn",
  _takeMatchAgentTurn,
);
export async function _takeMatchAgentTurn(
  db: GamePlayDB,
  kv: Deno.Kv,
  match_id: MatchId,
): Promise<boolean | NotFound | NotAllowed | GameError> {
  // TODO: Make it so there can only be one active player, then all this logic gets easier.

  // Lock the match if it's an agent's turn and it's not already locked.
  const lock_value = Uuid25.fromBytes(uuidv7obj().bytes).value;
  const lock = await db.transaction(
    async (_tx) => {
      const [lock_match_id] = await db.select({
        match_id: schema.matches.match_id,
      }).from(
        schema.matches,
      ).innerJoin(
        schema.match_turns,
        and(
          eq(schema.match_turns.match_id, schema.matches.match_id),
          eq(schema.match_turns.turn_number, schema.matches.turn_number),
        ),
      ).innerJoin(
        schema.match_players,
        and(
          eq(schema.match_players.match_id, schema.matches.match_id),
          eq(
            schema.match_players.player_number,
            sql`${schema.match_turns.status} -> '$.active_players[0]'`,
          ),
        ),
      ).leftJoin(
        schema.match_locks,
        eq(schema.match_locks.match_id, schema.matches.match_id),
      )
        .where(
          and(
            eq(schema.matches.match_id, match_id),
            eq(schema.match_turns.status_kind, "in_progress"),
            eq(schema.match_players.player_kind, "agent"),
            or(
              isNull(schema.match_locks.match_id),
              gt(
                sql`strftime('%s', 'now') - strftime('%s', ${schema.match_locks.timestamp})`,
                60 * 1,
              ),
            ),
          ),
        );
      if (lock_match_id) {
        const result = await db.insert(schema.match_locks).values({
          match_id,
          value: lock_value,
        }).returning({ match_id: schema.match_locks.match_id });
        return result[0].match_id;
      }
      return null;
    },
  );

  if (lock === null) {
    console.log("match is locked");
    return false;
  }

  const match_view = await fetchMatchById(db, match_id);
  if (match_view instanceof NotFound) {
    return match_view;
  }

  if (match_view.current_turn.status.status !== "in_progress") {
    return false;
  }

  // note: hardcoded to one active player. Fix for multiple players.
  const player_i = match_view.current_turn.status.active_players[0];
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

  // todo: retry logic
  //for (let retry = 0; retry < 3; retry++) {

  // Query the agent for the action.
  let response;
  try {
    const agent_action = await tracedFetch(agent.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(state),
    });
    console.log(agent_action);
    response = await agent_action.json();
  } catch (e) {
    console.error(e);
    // todo: good error handling of all the cases.
    throw e;
  }

  let action;
  let new_status;
  switch (match_view.game) {
    case "connect4": {
      action = Connect4Action.parse(response);

      const action_check = trace(
        "Connect4.checkAction",
        Connect4.checkAction,
        state,
        player_i,
        action,
      );
      if (action_check instanceof GameError) {
        return action_check;
      }
      new_status = trace(
        "Connect4.applyAction",
        Connect4.applyAction,
        state,
        player_i,
        action,
      );
      if (new_status instanceof GameError) {
        return new_status;
      }
      break;
    }
    default: {
      throw new Unreachable(match_view.game);
    }
  }

  // Update the match.
  await db.batch([
    db.delete(schema.match_locks).where(
      and(
        eq(schema.match_locks.match_id, match_id),
        eq(schema.match_locks.value, lock_value),
      ),
    ),
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

  await queueTask(kv, { kind: "agent_turn", match_id });

  return true;
}
