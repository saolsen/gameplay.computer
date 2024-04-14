// Node version of the schema module (and dependencies).
// drizzle-kit doesn't work on deno yet so this copy of
// the schema is used to generate migrations.
// Be sure to keep this file in sync with the rest of the code.
import { z } from "zod";
import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { LibSQLDatabase } from "drizzle-orm/libsql";

/// game.ts

export type JsonLiteral = string | number | boolean | null;
export type Json = JsonLiteral | { [key: string]: Json } | Json[];

export type CloneLiteral =
  | undefined
  | null
  | boolean
  | number
  | string
  | bigint
  | Uint8Array
  | Date
  | RegExp;

export type Name = string & { readonly Name: unique symbol };
export const Name = z
  .string()
  .regex(/^[a-zA-Z0-9_-]+$/)
  .min(4)
  .max(64)
  .transform((n) => n as Name);

export const GameKind = z.enum(["connect4"]);
export type GameKind = z.infer<typeof GameKind>;

export const PlayerKind = z.enum(["user", "agent"]);
export type PlayerKind = z.infer<typeof PlayerKind>;

export const UserPlayer = z.object({
  kind: z.literal("user"),
  username: Name,
});
export type UserPlayer = z.infer<typeof UserPlayer>;

export const AgentPlayer = z.object({
  kind: z.literal("agent"),
  username: Name,
  agentname: Name,
});
export type AgentPlayer = z.infer<typeof AgentPlayer>;

export const Player = z.discriminatedUnion("kind", [UserPlayer, AgentPlayer]);
export type Player = z.infer<typeof Player>;

export const StatusKind = z.enum(["in_progress", "over"]);
export type StatusKind = z.infer<typeof StatusKind>;

export const InProgress = z.object({
  status: z.literal("in_progress"),
  active_players: z.array(z.number()),
});
export type InProgress = z.infer<typeof InProgress>;

export const ResultKind = z.enum(["winner", "draw"]);
export type ResultKind = z.infer<typeof ResultKind>;

export const Winner = z.object({
  kind: z.literal("winner"),
  players: z.array(z.number()),
});
export type Winner = z.infer<typeof Winner>;

export const Draw = z.object({ kind: z.literal("draw") });
export type Draw = z.infer<typeof Draw>;

export const Errored = z.object({
  kind: z.literal("errored"),
  reason: z.string(),
});
export type Errored = z.infer<typeof Errored>;

export const Result = z.discriminatedUnion("kind", [Winner, Draw, Errored]);
export type Result = z.infer<typeof Result>;

export const Over = z.object({
  status: z.literal("over"),
  result: Result,
});
export type Over = z.infer<typeof Over>;

export const Status = z.discriminatedUnion("status", [InProgress, Over]);
export type Status = z.infer<typeof Status>;

export const GameArgs = z.object({
  players: z.array(Player),
});
export type GameArgs = z.infer<typeof GameArgs>;

export const GameErrorKind = z.enum(["args", "player", "action", "state"]);
export type GameErrorKind = z.infer<typeof GameErrorKind>;

export class GameError extends Error {
  kind: GameErrorKind;

  constructor(kind: GameErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

export type NewGame<A extends GameArgs, S extends Json, E extends GameError> = (
  create_args: A,
) => S | E;

export type CheckStatus<S, E extends GameError> = (state: S) => Status | E;

// Returns null if the action is allowed, or an error
// about why it is not allowed.
export type CheckAction<S extends Json, A extends Json, E extends GameError> = (
  state: S,
  player: number,
  action: A,
) => null | E;

export type ApplyAction<S extends Json, A extends Json, E extends GameError> = (
  state: S,
  player: number,
  action: A,
) => Status | E;

export type GetView<S extends Json, V extends Json, E extends GameError> = (
  state: S,
  player: number,
) => V | E;

export type Game<
  ARGS extends GameArgs,
  ACTION extends Json,
  STATE extends Json,
  VIEW extends Json,
  E extends GameError,
> = {
  kind: GameKind;
  newGame: NewGame<ARGS, STATE, E>;
  checkStatus: CheckStatus<STATE, E>;
  checkAction: CheckAction<STATE, ACTION, E>;
  applyAction: ApplyAction<STATE, ACTION, E>;
  getView: GetView<STATE, VIEW, E>;
};

/// connect4.ts

export const COLS = 7;
export const ROWS = 6;

// each slot can be null (empty), 0 (blue), or 1 (red).
export const Slot = z.nullable(z.number().nonnegative().lte(1));
export type Slot = z.infer<typeof Slot>;

export const Connect4State = z.object({
  game: z.literal("connect4"),
  next_player: z.number().nonnegative().lte(1),
  board: z.array(z.array(Slot).length(ROWS)).length(COLS),
});
export type Connect4State = z.infer<typeof Connect4State>;

export const Connect4Action = z.object({
  game: z.literal("connect4"),
  column: z.coerce.number().nonnegative().lt(7),
});
export type Connect4Action = z.infer<typeof Connect4Action>;

export type Connect4Args = {
  players: Player[];
};

export function newGame({ players }: Connect4Args): Connect4State | GameError {
  if (players.length !== 2) {
    return new GameError("args", "Connect4 requires exactly 2 players.");
  }

  return {
    game: "connect4",
    next_player: 0,
    board: [
      [null, null, null, null, null, null],
      [null, null, null, null, null, null],
      [null, null, null, null, null, null],
      [null, null, null, null, null, null],
      [null, null, null, null, null, null],
      [null, null, null, null, null, null],
      [null, null, null, null, null, null],
    ],
  };
}

export function get(state: Connect4State, col: number, row: number): Slot {
  return state.board[col][row];
}

export function set(
  state: Connect4State,
  col: number,
  row: number,
  slot: Slot,
): void {
  state.board[col][row] = slot;
}

function check_slots_eq(a: Slot, b: Slot, c: Slot, d: Slot): Slot {
  if (a === b && b === c && c === d) {
    return a;
  }
  return null;
}

export function checkStatus(state: Connect4State): Status | GameError {
  // Check Vertical Win
  for (let col = 0; col < COLS; col++) {
    for (let row = 0; row < 3; row++) {
      const check = check_slots_eq(
        get(state, col, row + 0),
        get(state, col, row + 1),
        get(state, col, row + 2),
        get(state, col, row + 3),
      );
      if (check !== null) {
        return {
          status: "over",
          result: { kind: "winner", players: [check] },
        };
      }
    }
  }
  // Check Horizontal Win
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < 4; col++) {
      const check = check_slots_eq(
        get(state, col + 0, row),
        get(state, col + 1, row),
        get(state, col + 2, row),
        get(state, col + 3, row),
      );
      if (check !== null) {
        return {
          status: "over",
          result: { kind: "winner", players: [check] },
        };
      }
    }
  }
  // Check Diagonal Up Win
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 3; row++) {
      const check = check_slots_eq(
        get(state, col + 0, row + 0),
        get(state, col + 1, row + 1),
        get(state, col + 2, row + 2),
        get(state, col + 3, row + 3),
      );
      if (check !== null) {
        return {
          status: "over",
          result: { kind: "winner", players: [check] },
        };
      }
    }
  }
  // Check Diagonal Down Win
  for (let col = 0; col < 4; col++) {
    for (let row = 3; row < 6; row++) {
      const check = check_slots_eq(
        get(state, col + 0, row - 0),
        get(state, col + 1, row - 1),
        get(state, col + 2, row - 2),
        get(state, col + 3, row - 3),
      );
      if (check !== null) {
        return {
          status: "over",
          result: { kind: "winner", players: [check] },
        };
      }
    }
  }
  // Check For Possible Moves
  for (let col = 0; col < COLS; col++) {
    if (get(state, col, ROWS - 1) === null) {
      return {
        status: "in_progress",
        active_players: [state.next_player],
      };
    }
  }
  // No Possible Moves, Draw
  return {
    status: "over",
    result: { kind: "draw" },
  };
}

// Returns null if the action is allowed.
export function checkAction(
  state: Connect4State,
  player: number,
  action: Connect4Action,
): null | GameError {
  if (player !== state.next_player) {
    return new GameError("player", "It is not this player's turn.");
  }
  if (action.column < 0 || action.column >= COLS) {
    return new GameError("action", "Column is out of bounds.");
  }
  if (get(state, action.column, ROWS - 1) !== null) {
    return new GameError("action", "Column is full.");
  }
  return null;
}

export function applyAction(
  state: Connect4State,
  player: number,
  action: Connect4Action,
): Status | GameError {
  const check = checkAction(state, player, action);
  if (check instanceof GameError) {
    return check;
  }
  for (let row = 0; row < ROWS; row++) {
    if (get(state, action.column, row) === null) {
      set(state, action.column, row, player);
      state.next_player = 1 - player;
      return checkStatus(state);
    }
  }
  throw new Error("unreachable");
}

export function getView(
  state: Connect4State,
  _player: number,
): Connect4State | GameError {
  return state;
}

export type Connect4Agent = (state: Connect4State) => Connect4Action;
export type Connect4AsyncAgent = (
  state: Connect4State,
) => Promise<Connect4Action>;

export const Connect4: Game<
  Connect4Args,
  Connect4Action,
  Connect4State,
  Connect4State,
  GameError
> = {
  kind: "connect4",
  newGame,
  checkStatus,
  checkAction,
  applyAction,
  getView,
};

/// Schema Module

export class Unreachable extends Error {
  constructor(x: never) {
    super(`Unreachable: ${x}`);
  }
}

export class Todo extends Error {
  constructor(message?: string) {
    super("Todo: " + message || "Not Implemented");
  }
}

export class NotFound extends Error {
  object_type: string;
  object_id: string;

  constructor(object_type: string, object_id: string) {
    super("Not Found");
    this.object_type = object_type;
    this.object_id = object_id;
  }
}

export class NotAllowed extends Error {
  user_id: UserId;
  object_type: string;
  object_id: string | null;
  reason?: string;

  constructor(
    user_id: UserId,
    object_type: string,
    object_id: string | null,
    reason?: string,
  ) {
    super("Unauthorized");
    this.user_id = user_id;
    this.object_type = object_type;
    this.object_id = object_id;
    this.reason = reason;
  }
}

export type UserId = string & { readonly UserId: unique symbol };
export const UserId = z
  .string()
  .startsWith("u_")
  .length(27)
  .transform((k) => k as UserId);

export type MatchId = string & { readonly MatchId: unique symbol };
export const MatchId = z
  .string()
  .startsWith("m_")
  .length(27)
  .transform((k) => k as MatchId);

export type AgentId = string & { readonly AgentId: unique symbol };
export const AgentId = z
  .string()
  .startsWith("a_")
  .length(27)
  .transform((k) => k as AgentId);

export const Action = z.discriminatedUnion("game", [Connect4Action]);
export type Action = z.infer<typeof Action>;

export const State = z.discriminatedUnion("game", [Connect4State]);
export type State = z.infer<typeof State>;

export const AgentStatusKind = z.enum(["active", "inactive"]);
export type AgentStatusKind = z.infer<typeof AgentStatusKind>;

export const AgentActive = z.object({
  status: z.literal("active"),
});
export type AgentActive = z.infer<typeof AgentActive>;

export const AgentInactive = z.object({
  status: z.literal("inactive"),
  // todo: Add reason for being inactive.
});
export type AgentInactive = z.infer<typeof AgentInactive>;

export const AgentStatus = z.discriminatedUnion("status", [
  AgentActive,
  AgentInactive,
]);
export type AgentStatus = z.infer<typeof AgentStatus>;

export type AgentSlug = string & { readonly AgentSlug: unique symbol };
export const AgentSlug = z
  .string()
  .refine(
    (s) => {
      const split = s.split("/");
      if (split.length !== 2) {
        return false;
      }
      const [username, agentname] = split;
      if (!Name.safeParse(username).success) {
        return false;
      }
      if (!Name.safeParse(agentname).success) {
        return false;
      }
      return true;
    },
    { message: "Must be `username/agentname`" },
  )
  .transform((n) => n as AgentSlug);

export type Url = string & { readonly Url: unique symbol };
export const Url = z
  .string()
  .url()
  .transform((u) => u as Url);

export const users = sqliteTable("users", {
  user_id: text("user_id").$type<UserId>().primaryKey(),
  username: text("username").$type<Name>().unique().notNull(),
  first_name: text("first_name"),
  last_name: text("last_name"),
  email_address: text("email_address").notNull(),
  clerk_user_id: text("clerk_user_id").unique().notNull(),
  created_at: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export type InsertUser = typeof users.$inferInsert;
export type SelectUser = typeof users.$inferSelect;

export const agents = sqliteTable(
  "agents",
  {
    agent_id: text("agent_id").$type<AgentId>().primaryKey(),
    game: text("game").$type<GameKind>().notNull(),
    user_id: text("user_id")
      .$type<UserId>()
      .notNull()
      .references(() => users.user_id),
    agentname: text("agentname").$type<Name>().notNull(),
    status_kind: text("status_kind").$type<AgentStatusKind>().notNull(),
    status: text("status", { mode: "json" }).$type<AgentStatus>().notNull(),
    url: text("url").$type<Url>().notNull(),
    created_at: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => {
    return {
      agentUserIdx: index("agent_user_idx").on(table.user_id),
      agentGameIdx: index("agent_game_idx").on(table.game),
      agentGameStatusIdx: index("agent_game_status_idx").on(
        table.game,
        table.status_kind,
      ),
      agentAgentnameIdx: uniqueIndex("agent_agentname_idx").on(
        table.user_id,
        table.game,
        table.agentname,
      ),
    };
  },
);

export type InsertAgent = typeof agents.$inferInsert;
export type SelectAgent = typeof agents.$inferSelect;

export const matches = sqliteTable(
  "matches",
  {
    match_id: text("match_id").$type<MatchId>().primaryKey(),
    game: text("game").$type<GameKind>().notNull(),
    created_by: text("created_by")
      .$type<UserId>()
      .notNull()
      .references(() => users.user_id),
    turn_number: integer("turn_number").notNull(),
    created_at: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => {
    return {
      matchGameIdx: index("match_game_idx").on(table.game),
      // todo: list matches for a user should also show created_by even
      // if they are not a player.
      matchCreatedByIdx: index("match_created_by_idx").on(table.created_by),
    };
  },
);

export const match_locks = sqliteTable(
  "match_locks",
  {
    match_id: text("match_id").$type<MatchId>().primaryKey().references(
      () => matches.match_id,
      { onDelete: "cascade" },
    ),
    value: text("value").notNull(),
    timestamp: integer("timestamp", { mode: "timestamp" })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
);

export type InsertMatch = typeof matches.$inferInsert;
export type SelectMatch = typeof matches.$inferSelect;

export const match_players = sqliteTable(
  "match_players",
  {
    match_id: text("match_id")
      .$type<MatchId>()
      .notNull()
      .references(() => matches.match_id, { onDelete: "cascade" }),
    player_number: integer("player_number").notNull(),
    player_kind: text("player_kind").$type<PlayerKind>().notNull(),
    user_id: text("user_id")
      .$type<UserId>()
      .references(() => users.user_id),
    agent_id: text("agent_id")
      .$type<AgentId>()
      .references(() => agents.agent_id),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.match_id, table.player_number] }),
      matchPlayerUserIdx: index("match_player_user_idx").on(table.user_id),
      matchPlayerAgentIdx: index("match_player_agent_idx").on(table.agent_id),
    };
  },
);

export type InsertMatchPlayer = typeof match_players.$inferInsert;
export type SelectMatchPlayer = typeof match_players.$inferSelect;

export const match_turns = sqliteTable(
  "match_turns",
  {
    match_id: text("match_id")
      .$type<MatchId>()
      .notNull()
      .references(() => matches.match_id, { onDelete: "cascade" }),
    turn_number: integer("turn_number").notNull(),
    status_kind: text("status_kind").$type<StatusKind>().notNull(),
    status: text("status", { mode: "json" }).$type<Status>().notNull(),
    player_number: integer("player"),
    action: text("action", { mode: "json" }).$type<Action>(),
    state: text("state", { mode: "json" }).$type<State>().notNull(),
    timestamp: integer("timestamp", { mode: "timestamp" })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.match_id, table.turn_number] }),
      matchTurnStatusKindIdx: index("match_turn_status_kind_idx").on(
        table.status_kind,
      ),
    };
  },
);

export type InsertMatchTurn = typeof match_turns.$inferInsert;
export type SelectMatchTurn = typeof match_turns.$inferSelect;

export const schema = { users, agents, matches, match_players, match_turns };

export type GamePlayDB = LibSQLDatabase<typeof schema>;
