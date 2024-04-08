import { z } from "zod";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { LibSQLDatabase } from "drizzle-orm/libsql";

import { GameKind, PlayerKind, Status, StatusKind } from "./game.ts";

import { Connect4Action, Connect4State } from "./connect4.ts";

export class Unreachable extends Error {
  constructor(x: never) {
    super(`Unreachable: ${x}`);
  }
}

export class Todo extends Error {
  constructor(message?: string) {
    super(message || "Not Implemented");
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
    reason?: string
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

export const users = sqliteTable("users", {
  user_id: text("user_id").$type<UserId>().primaryKey(),
  username: text("username").unique().notNull(),
  first_name: text("first_name"),
  last_name: text("last_name"),
  email_address: text("email_address").notNull(),
  clerk_user_id: text("clerk_user_id").unique().notNull(),
  created_at: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
});

export type InsertUser = typeof users.$inferInsert;
export type SelectUser = typeof users.$inferSelect;

export const agents = sqliteTable("agents", {
  agent_id: text("agent_id").$type<AgentId>().primaryKey(),
  created_at: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
});

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
    created_at: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
  },
  (table) => {
    return {
      gameIdx: index("game_idx").on(table.game),
      createdByIdx: index("created_by_idx").on(table.created_by),
    };
  }
);

export type InsertMatch = typeof matches.$inferInsert;
export type SelectMatch = typeof matches.$inferSelect;

export const match_players = sqliteTable(
  "match_players",
  {
    match_id: text("match_id")
      .$type<MatchId>()
      .notNull()
      .references(() => matches.match_id),
    player_number: integer("player_number").notNull(),
    player_kind: text("player_kind").$type<PlayerKind>().notNull(),
    user_id: text("user_id")
      .$type<UserId>()
      .references(() => users.user_id),
    agent_id: text("agent_id")
      .$type<AgentId>()
      .references(() => matches.match_id),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.match_id, table.player_number] }),
      userIdx: index("user_idx").on(table.user_id),
      agentIdx: index("agent_idx").on(table.agent_id),
    };
  }
);

export type InsertMatchPlayer = typeof match_players.$inferInsert;
export type SelectMatchPlayer = typeof match_players.$inferSelect;

export const match_turns = sqliteTable(
  "match_turns",
  {
    match_id: text("match_id")
      .$type<MatchId>()
      .notNull()
      .references(() => matches.match_id),
    turn_number: integer("turn_number").notNull(),
    status_kind: text("status_kind").$type<StatusKind>().notNull(),
    status: text("status", { mode: "json" }).$type<Status>().notNull(),
    player_number: integer("player"),
    action: text("action", { mode: "json" }).$type<Action>(),
    state: text("state", { mode: "json" }).$type<State>().notNull(),
    created_at: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.match_id, table.turn_number] }),
      statusKindIdx: index("status_kind_idx").on(table.status_kind),
    };
  }
);

export type InsertMatchTurn = typeof match_turns.$inferInsert;
export type SelectMatchTurn = typeof match_turns.$inferSelect;

export const schema = { users, agents, matches, match_players, match_turns };

export type GamePlayDB = LibSQLDatabase<typeof schema>;
