import { z } from "npm:zod@3.22.4";
import { sql } from "npm:drizzle-orm@0.30.7";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "npm:drizzle-orm@0.30.7/sqlite-core";
import { LibSQLDatabase } from "npm:drizzle-orm@0.30.7/libsql";

import {
  GameKind,
  Name,
  PlayerKind,
  Status,
  StatusKind,
} from "../gameplay_game.ts";
import { Connect4Action, Connect4State } from "../gameplay_connect4.ts";

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

export const schema = {
  users,
  agents,
  matches,
  match_players,
  match_turns,
  match_locks,
};

export type GamePlayDB = LibSQLDatabase<typeof schema>;
