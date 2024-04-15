/** @jsxImportSource npm:hono@4.2.2/jsx */
// deno-lint-ignore-file no-namespace
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import "node:async_hooks";
import {
  context,
  propagation,
  Span,
  SpanStatusCode,
  trace as otelTrace,
  Tracer,
} from "npm:@opentelemetry/api";
import { OTLPTraceExporter } from "npm:@opentelemetry/exporter-trace-otlp-http";
import { B3Propagator } from "npm:@opentelemetry/propagator-b3";
import { Resource } from "npm:@opentelemetry/resources";
import {
  SimpleSpanProcessor,
  WebTracerProvider,
} from "npm:@opentelemetry/sdk-trace-web";
import { SEMRESATTRS_SERVICE_NAME } from "npm:@opentelemetry/semantic-conventions";
import { AsyncLocalStorageContextManager } from "npm:@opentelemetry/context-async-hooks";
import { z } from "npm:zod@3.22.4";
import { Uuid25 } from "npm:uuid25@0.1.4";
import { uuidv7obj } from "npm:uuidv7@0.6.3";
import {
  Config,
  InStatement,
  ResultSet,
  TransactionMode,
} from "npm:@libsql/client@0.6.0";
import { HttpClient } from "npm:@libsql/client@0.6.0/http";
import { expandConfig } from "npm:@libsql/core@0.6.0/config";
import { and, eq, gt, isNull, or, sql } from "npm:drizzle-orm@0.30.7";
import {
  alias,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "npm:drizzle-orm@0.30.7/sqlite-core";
import { LibSQLDatabase } from "npm:drizzle-orm@0.30.7/libsql";
import { importSPKI, jwtVerify } from "npm:jose@5.2.3";
import { Context, Hono, MiddlewareHandler } from "npm:hono@4.2.2";
import { Child, FC } from "npm:hono@4.2.2/jsx";
import { jsxRenderer, useRequestContext } from "npm:hono@4.2.2/jsx-renderer";
import { html } from "npm:hono@4.2.2/html";
import { getCookie } from "npm:hono@4.2.2/cookie";

import {
  GameError,
  GameKind,
  Name,
  Player,
  PlayerKind,
  Status,
  StatusKind,
} from "./gameplay_game.ts";
import {
  Connect4,
  Connect4Action,
  Connect4State,
} from "./gameplay_connect4.ts";
import { encodeBaseUrl } from "npm:@libsql/core@0.6.0/uri";

declare module "npm:hono@4.2.2" {
  interface ContextRenderer {
    (content: JSX.Element): Response;
  }
}

export namespace Tracing {
  export function getTracer(): Tracer {
    return otelTrace.getTracer("gameplay");
  }

  /**
   * Initializes opentelemetry tracing.
   */
  export function setupTracing(honeycomb_api_key: string): void {
    const provider = new WebTracerProvider({
      resource: new Resource({
        [SEMRESATTRS_SERVICE_NAME]: "gameplay",
      }),
    });

    // Send traces to honeycomb.
    provider.addSpanProcessor(
      new SimpleSpanProcessor(
        new OTLPTraceExporter({
          url: "https://api.honeycomb.io/v1/traces",
          headers: {
            "x-honeycomb-team": honeycomb_api_key,
          },
        }),
      ),
    );

    provider.register({
      contextManager: new AsyncLocalStorageContextManager(),
      propagator: new B3Propagator(),
    });
  }

  export const tracingMiddleware: MiddlewareHandler = async (
    c,
    next,
  ): Promise<void | Response> => {
    let active_context = null;
    const prop_header = c.req.header("b3");
    if (prop_header) {
      active_context = propagation.extract(context.active(), {
        b3: prop_header,
      });
    }
    await getTracer().startActiveSpan(
      `${c.req.method} ${c.req.url}`,
      {},
      active_context!,
      async (span) => {
        await next();
        span.setAttributes({
          "http.method": c.req.method,
          "http.url": c.req.url,
          "response.status_code": c.res.status,
        });
        const user = c.get("user");
        if (user) {
          span.setAttributes({
            user_id: user.id,
            user_username: user.username,
            user_email_address: user.email_address,
          });
        }
        if (c.res.ok && c.res.status >= 200 && c.res.status < 500) {
          span.setStatus({ code: SpanStatusCode.OK });
        } else {
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: c.error?.message ?? "Unknown error",
          });
          if (c.error) {
            span.recordException(c.error);
            console.error(c.error);
          }
        }
        span.end();
      },
    );
  };

  export function traced<
    // deno-lint-ignore no-explicit-any
    F extends (...args: any[]) => any,
  >(name: string, f: F) {
    return async function (
      ...args: Parameters<F>
    ): Promise<Awaited<ReturnType<F>>> {
      return await traceAsync(name, f, ...args);
    };
  }

  export function traceAsync<
    // deno-lint-ignore no-explicit-any
    F extends (...args: any[]) => any,
  >(
    name: string,
    fn: F,
    ...args: Parameters<F>
  ): Promise<Awaited<ReturnType<F>>> {
    return getTracer().startActiveSpan(name, async (span: Span) => {
      try {
        const result = await fn(...args);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error.message,
        });
        span.recordException(error);
        throw error;
      } finally {
        span.end();
      }
    });
  }

  export function trace<
    // deno-lint-ignore no-explicit-any
    F extends (...args: any[]) => any,
  >(name: string, fn: F, ...args: Parameters<F>): ReturnType<F> {
    return getTracer().startActiveSpan(name, (span: Span) => {
      try {
        const result = fn(...args);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error.message,
        });
        span.recordException(error);
        throw error;
      } finally {
        span.end();
      }
    });
  }

  export async function tracedFetch(
    input: string | URL,
    init?: RequestInit,
  ): Promise<Response> {
    return await getTracer().startActiveSpan(`fetch`, async (span) => {
      const prop_output: { b3: string } = { b3: "" };
      propagation.inject(context.active(), prop_output);
      try {
        console.log("fetching", input);
        console.log(init);
        const resp: Response = await fetch(input + "/", {
          ...init,
          headers: {
            b3: prop_output.b3,
            ...(init?.headers ?? {}),
          },
        });
        console.log(resp);
        span.setAttributes({
          "http.url": resp.url,
          "response.status_code": resp.status,
        });
        if (resp.ok && resp.status >= 200 && resp.status < 400) {
          span.setStatus({ code: SpanStatusCode.OK });
        } else {
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: await resp.clone().text(),
          });
        }
        return resp;
      } catch (error) {
        console.log("what happened????");
        console.error(error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error.message,
        });
        throw new Error(error);
      } finally {
        span.end();
      }
    });
  }

  export class TracedClient extends HttpClient {
    constructor(config: Config) {
      const expanded = expandConfig(config, true);
      const url = encodeBaseUrl(
        expanded.scheme,
        expanded.authority,
        expanded.path,
      );
      super(url, expanded.authToken, expanded.intMode, expanded.fetch);
    }

    async batch(
      statements: InStatement[],
      mode?: TransactionMode,
    ): Promise<ResultSet[]> {
      return await getTracer().startActiveSpan(`sqlite:batch`, async (span) => {
        for (const statement of statements) {
          if (typeof statement === "string") {
            span.addEvent("sqlite.batch", {
              statement: statement,
            });
          } else {
            const kind = statement.sql.split(" ")[0];
            span.addEvent("sqlite.batch " + kind, {
              "sqlite.statement": statement.sql,
              "sqlite.args": JSON.stringify(statement.args, null, 2),
            });
          }
        }
        try {
          const result = await super.batch(statements, mode);
          span.setStatus({ code: SpanStatusCode.OK });
          return result;
        } catch (error) {
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error.message,
          });
          throw new Error(error);
        } finally {
          span.end();
        }
      });
    }

    async execute(statement: InStatement): Promise<ResultSet> {
      return await getTracer().startActiveSpan(
        `sqlite:execute`,
        async (span) => {
          if (typeof statement === "string") {
            span.addEvent("sqlite.execute", {
              "sqlite.statement": statement,
            });
          } else {
            const kind = statement.sql.split(" ")[0];
            span.addEvent("sqlite.execute " + kind, {
              "sqlite.statement": statement.sql,
              "sqlite.args": JSON.stringify(statement.args, null, 2),
            });
          }
          try {
            const result = await super.execute(statement);
            span.setStatus({ code: SpanStatusCode.OK });
            return result;
          } catch (error) {
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: error.message,
            });
            throw new Error(error);
          } finally {
            span.end();
          }
        },
      );
    }
  }
}

export namespace Schema {
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
}

export namespace Users {
  import NotFound = Schema.NotFound;

  import UserId = Schema.UserId;
  import SelectUser = Schema.SelectUser;

  import GamePlayDB = Schema.GamePlayDB;
  import schema = Schema.schema;

  export function userId(): UserId {
    return `u_${Uuid25.fromBytes(uuidv7obj().bytes).value}` as UserId;
  }

  export const fetchUserByUsername = Tracing.traced(
    "fetchUserByUsername",
    _fetchUserByUsername,
  );
  async function _fetchUserByUsername(
    db: GamePlayDB,
    username: Name,
  ): Promise<SelectUser | NotFound> {
    const users = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.username, username));
    if (users.length > 0) {
      return users[0];
    }
    return new NotFound("user", username);
  }

  export const ClerkUser = z.object({
    clerk_user_id: z.string(),
    first_name: z.string().nullable(),
    last_name: z.string().nullable(),
    username: Name,
    email_address: z.string(),
  });
  export type ClerkUser = z.infer<typeof ClerkUser>;

  export const syncClerkUser = Tracing.traced("syncClerkUser", _syncClerkUser);
  export async function _syncClerkUser(
    db: GamePlayDB,
    clerk_user: ClerkUser,
  ): Promise<SelectUser> {
    const users = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.clerk_user_id, clerk_user.clerk_user_id));
    if (users.length > 0) {
      const user = users[0];

      // Update if anything changed.
      const changed_fields: {
        first_name?: string | null;
        last_name?: string | null;
        username?: Name;
        email_address?: string;
      } = {};
      if (user.first_name !== clerk_user.first_name) {
        changed_fields["first_name"] = clerk_user.first_name;
      }
      if (user.last_name !== clerk_user.last_name) {
        changed_fields["last_name"] = clerk_user.last_name;
      }
      if (user.username !== clerk_user.username) {
        changed_fields["username"] = clerk_user.username;
      }
      if (user.email_address !== clerk_user.email_address) {
        changed_fields["email_address"] = clerk_user.email_address;
      }

      if (Object.keys(changed_fields).length == 0) {
        return user;
      }

      await db
        .update(schema.users)
        .set(changed_fields)
        .where(eq(schema.users.user_id, user.user_id));
      // todo: user updated event
      return { ...user, ...changed_fields };
    }

    // New User
    const user_id = userId();
    const new_users = await db
      .insert(schema.users)
      .values({
        user_id,
        username: clerk_user.username,
        first_name: clerk_user.first_name,
        last_name: clerk_user.last_name,
        email_address: clerk_user.email_address,
        clerk_user_id: clerk_user.clerk_user_id,
      })
      .returning();
    const user = new_users[0];
    // todo: user created event
    return user;
  }
}

export namespace Agents {
  import NotFound = Schema.NotFound;

  import Url = Schema.Url;
  import UserId = Schema.UserId;
  import SelectUser = Schema.SelectUser;

  import AgentId = Schema.AgentId;
  import AgentSlug = Schema.AgentSlug;
  import AgentStatusKind = Schema.AgentStatusKind;
  import AgentStatus = Schema.AgentStatus;
  import SelectAgent = Schema.SelectAgent;

  import GamePlayDB = Schema.GamePlayDB;
  import schema = Schema.schema;

  export function agentId(): AgentId {
    return `a_${Uuid25.fromBytes(uuidv7obj().bytes).value}` as AgentId;
  }

  export const AgentView = z.object({
    agent_id: AgentId,
    game: GameKind,
    agentname: Name,
    user_id: UserId,
    username: Name,
    slug: AgentSlug,
    status: AgentStatus,
    url: Url,
    created_at: z.date(),
  });
  export type AgentView = z.infer<typeof AgentView>;

  export const fetchAgentById = Tracing.traced(
    "fetchAgentById",
    _fetchAgentById,
  );
  async function _fetchAgentById(
    db: GamePlayDB,
    agent_id: AgentId,
  ): Promise<SelectAgent | NotFound> {
    const results = await db
      .select()
      .from(schema.agents)
      .where(eq(schema.agents.agent_id, agent_id));
    if (results.length === 0) {
      return new NotFound("agent", agent_id);
    }
    return results[0];
  }

  export const fetchAgentByUsernameAndAgentname = Tracing.traced(
    "fetchAgentByUsernameAndAgentname",
    _fetchAgentByUsernameAndAgentname,
  );
  async function _fetchAgentByUsernameAndAgentname(
    db: GamePlayDB,
    username: Name,
    agentname: Name,
  ): Promise<AgentView | NotFound> {
    const results = await db
      .select({
        agent_id: schema.agents.agent_id,
        game: schema.agents.game,
        agentname: schema.agents.agentname,
        user_id: schema.agents.user_id,
        username: schema.users.username,
        status: schema.agents.status,
        url: schema.agents.url,
        created_at: schema.agents.created_at,
      })
      .from(schema.agents)
      .innerJoin(schema.users, eq(schema.agents.user_id, schema.users.user_id))
      .where(and(
        eq(schema.agents.agentname, agentname),
        eq(schema.users.username, username),
      ));

    if (results.length === 0) {
      return new NotFound("agent", username + "/" + agentname);
    }
    const result = results[0];

    return { ...result, slug: AgentSlug.parse(username + "/" + agentname) };
  }

  export const findAgentsForGame = Tracing.traced(
    "findAgentsForGame",
    _findAgentsForGame,
  );
  async function _findAgentsForGame(
    db: GamePlayDB,
    game: GameKind,
    status: AgentStatusKind = "active",
  ): Promise<AgentSlug[]> {
    const agent_slugs: AgentSlug[] = [];
    const results = await db
      .select()
      .from(schema.agents)
      .innerJoin(schema.users, eq(schema.agents.user_id, schema.users.user_id))
      .where(
        and(
          eq(schema.agents.game, game),
          eq(schema.agents.status_kind, status),
        ),
      );
    for (const result of results) {
      agent_slugs.push(
        AgentSlug.parse(result.users.username + "/" + result.agents.agentname),
      );
    }
    return agent_slugs;
  }

  export const UserAgent = z.object({
    agent_id: AgentId,
    agentname: Name,
    agent_slug: AgentSlug,
    status_kind: AgentStatusKind,
  });
  export type UserAgent = z.infer<typeof UserAgent>;

  /* export const findAgentsForUser = traced(
    "findAgentsForUser",
    _findAgentsForUser,
  );
  async function _findAgentsForUser(
    db: GamePlayDB,
    user: SelectUser,
  ): Promise<UserAgent[]> {
    const results = await db
      .select()
      .from(schema.agents)
      .where(eq(schema.agents.user_id, user.user_id));
    return [];
  } */

  export const findAgentsForGameAndUser = Tracing.traced(
    "findAgentsForGameAndUser",
    _findAgentsForGameAndUser,
  );
  async function _findAgentsForGameAndUser(
    db: GamePlayDB,
    game: GameKind,
    user: SelectUser,
  ): Promise<UserAgent[]> {
    const results = await db
      .select({
        agent_id: schema.agents.agent_id,
        agentname: schema.agents.agentname,
        status_kind: schema.agents.status_kind,
      })
      .from(schema.agents)
      .where(
        and(
          eq(schema.agents.user_id, user.user_id),
          eq(schema.agents.game, game),
        ),
      );
    return results.map((result) => {
      return {
        agent_id: result.agent_id,
        agentname: result.agentname,
        agent_slug: AgentSlug.parse(user.username + "/" + result.agentname),
        status_kind: result.status_kind,
      };
    });
  }

  export const createAgent = Tracing.traced("createAgent", _createAgent);
  async function _createAgent(
    db: GamePlayDB,
    user: SelectUser,
    game: GameKind,
    agentname: Name,
    url: Url,
  ): Promise<AgentId> {
    const agent_id = agentId();
    await db.insert(schema.agents).values({
      agent_id,
      game,
      user_id: user.user_id,
      agentname,
      status_kind: "active",
      status: { status: "active" },
      url,
    });
    return agent_id;
  }
}

export namespace Matches {
  import NotFound = Schema.NotFound;
  import Todo = Schema.Todo;
  import Unreachable = Schema.Unreachable;
  import NotAllowed = Schema.NotAllowed;

  import UserId = Schema.UserId;
  import SelectUser = Schema.SelectUser;
  import AgentId = Schema.AgentId;

  import MatchId = Schema.MatchId;
  import InsertMatchPlayer = Schema.InsertMatchPlayer;

  import GamePlayDB = Schema.GamePlayDB;
  import schema = Schema.schema;

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

  export const fetchMatchById = Tracing.traced(
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

  export const findMatchesForGameAndUser = Tracing.traced(
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

  export const createMatch = Tracing.traced("createMatch", _createMatch);
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
          const user = await Users.fetchUserByUsername(db, player.username);
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
          const agent = await Agents.fetchAgentByUsernameAndAgentname(
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

  export const takeMatchUserTurn = Tracing.traced(
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
        const action_check = Tracing.trace(
          "Connect4.checkAction",
          Connect4.checkAction,
          state,
          player_i,
          action.action,
        );
        if (action_check instanceof GameError) {
          return action_check;
        }
        new_status = Tracing.trace(
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

  export const takeMatchAgentTurn = Tracing.traced(
    "takeMatchAgentTurn",
    _takeMatchAgentTurn,
  );
  export async function _takeMatchAgentTurn(
    db: GamePlayDB,
    match_id: MatchId,
  ): Promise<boolean | NotFound | NotAllowed | GameError> {
    // TODO: Make it so there can only be one active player, then all this logic gets easier.

    // Lock the match if it's an agent's turn and it's not already locked.
    const lock_value = Uuid25.fromBytes(uuidv7obj().bytes).value;
    const lock = await db.transaction(
      async (tx) => {
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

    const agent = await Agents.fetchAgentByUsernameAndAgentname(
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
      const agent_action = await Tracing.tracedFetch(agent.url, {
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

        const action_check = Tracing.trace(
          "Connect4.checkAction",
          Connect4.checkAction,
          state,
          player_i,
          action,
        );
        if (action_check instanceof GameError) {
          return action_check;
        }
        new_status = Tracing.trace(
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

    return true;
  }
}

export namespace Connect4Web {
  import Unreachable = Schema.Unreachable;
  import SelectUser = Schema.SelectUser;

  import Connect4CurrentTurn = Matches.Connect4CurrentTurn;
  import Connect4MatchView = Matches.Connect4MatchView;

  export const CreateConnect4MatchFormData = z.object({
    game: z.literal("connect4"),
    "player_type[0]": z.union([z.literal("me"), z.literal("agent")]),
    "player_name[0]": z.string(),
    "player_type[1]": z.union([z.literal("me"), z.literal("agent")]),
    "player_name[1]": z.string(),
    "player_error[0]": z.string().optional(),
    "player_error[1]": z.string().optional(),
    form_error: z.string().optional(),
  });
  export type CreateConnect4MatchFormData = z.infer<
    typeof CreateConnect4MatchFormData
  >;

  // Todo: can probably do validation outside of the component now.
  export function validateCreateConnect4MatchForm(
    user: SelectUser,
    usernames: string[], // usernames
    agent_slugs: string[], // username/agentname
    data: CreateConnect4MatchFormData,
  ): {
    new_data: CreateConnect4MatchFormData;
    error: boolean;
    new_match?: {
      players: Player[];
    };
  } {
    const player_inputs = [
      {
        player_type: data["player_type[0]"],
        player_name: data["player_name[0]"],
      },
      {
        player_type: data["player_type[1]"],
        player_name: data["player_name[1]"],
      },
    ];

    let error = false;
    const players: Player[] = [];
    const player_errors: string[] = ["", ""];

    for (let i = 0; i < 2; i++) {
      const player_type = player_inputs[i].player_type;
      const player_name = player_inputs[i].player_name;
      switch (player_type) {
        case "me": {
          // name must be the user's name.
          const parsed_username = Name.safeParse(player_name);
          if (!parsed_username.success) {
            error = true;
            player_errors[i] = "Invalid username.";
            break;
          }
          const username = parsed_username.data;
          if (username !== user.username) {
            error = true;
            player_errors[i] = "Invalid username.";
            break;
          }

          players.push({
            kind: "user",
            username,
          });
          break;
        }
        case "agent": {
          if (!agent_slugs.includes(player_name)) {
            error = true;
            player_errors[i] = "Invalid agent name.";
            break;
          }

          const split = player_name.split("/");
          if (split.length !== 2) {
            error = true;
            player_errors[i] = "Invalid agent name.";
            break;
          }

          const [username_s, agentname_s] = split;
          const parsed_username = Name.safeParse(username_s);
          if (!parsed_username.success) {
            error = true;
            player_errors[i] = "Invalid agent name.";
            break;
          }
          const username = parsed_username.data;

          const parsed_agentname = Name.safeParse(agentname_s);
          if (!parsed_agentname.success) {
            error = true;
            player_errors[i] = "Invalid agent name.";
            break;
          }
          const agentname = parsed_agentname.data;

          players.push({
            kind: "agent",
            username,
            agentname,
          });
          break;
        }
        default: {
          throw new Unreachable(player_type);
        }
      }
    }

    data["player_error[0]"] = player_errors[0];
    data["player_error[1]"] = player_errors[1];

    return { new_data: data, error, new_match: { players } };
  }

  export const CreateConnect4MatchForm: FC<{
    user: SelectUser;
    usernames: string[]; // usernames
    agent_slugs: string[]; // username/agentname
    create_connect4_match?: CreateConnect4MatchFormData;
  }> = ({ user, usernames, agent_slugs, create_connect4_match }) => {
    if (!create_connect4_match) {
      create_connect4_match = {
        game: "connect4",
        "player_type[0]": "me",
        "player_name[0]": user.username,
        "player_type[1]": "me",
        "player_name[1]": user.username,
      };
    }

    const players = [
      {
        type: create_connect4_match["player_type[0]"],
        name: create_connect4_match["player_name[0]"],
      },
      {
        type: create_connect4_match["player_type[1]"],
        name: create_connect4_match["player_name[1]"],
      },
    ];

    const player_inputs = [];

    for (let i = 0; i < 2; i++) {
      switch (players[i].type) {
        case "me": {
          player_inputs.push(
            <input
              type="hidden"
              name={`player_name[${i}]`}
              value={user.username}
            />,
          );
          break;
        }
        case "agent": {
          if (!agent_slugs.includes(players[i].name)) {
            players[i].name = "";
          }
          player_inputs.push(
            <label className="label">
              <span class="label-text">Agent</span>
              <select
                className="select select-bordered w-full max-w-xs"
                name={`player_name[${i}]`}
                value={players[i].name}
              >
                <option disabled selected>
                  Select An Option
                </option>
                {agent_slugs.map((agent_slug) => (
                  <option
                    value={agent_slug}
                    selected={players[i].name === agent_slug}
                  >
                    {agent_slug}
                  </option>
                ))}
              </select>
            </label>,
          );
          break;
        }
      }
    }

    return (
      <form
        id="connect4_create_match_form"
        hx-post="/g/connect4/m/create_match"
        hx-target="this"
        hx-swap="outerHTML"
      >
        <input type="hidden" name="game" value="connect4" />

        <div class="container">
          <h2 class="text-4xl">Create Connect4 Match</h2>
          <div>
            <h3 class="text-3xl">Blue Player</h3>
            <div class="form-control">
              <span class="label-text">Type</span>
              <div class="join">
                <input
                  class="join-item btn"
                  type="radio"
                  name="player_type[0]"
                  value="me"
                  aria-label="Me"
                  checked={create_connect4_match["player_type[0]"] === "me"}
                  hx-get="/g/connect4/m/create_match"
                  hx-include="#connect4_create_match_form"
                  hx-target="#connect4_create_match_form"
                  hx-swap="outerHTML"
                />
                <input
                  class="join-item btn"
                  type="radio"
                  name="player_type[0]"
                  value="agent"
                  aria-label="Agent"
                  checked={create_connect4_match["player_type[0]"] === "agent"}
                  hx-get="/g/connect4/m/create_match"
                  hx-include="#connect4_create_match_form"
                  hx-target="#connect4_create_match_form"
                  hx-swap="outerHTML"
                />
              </div>
              {player_inputs[0]}
              {create_connect4_match["player_error[0]"] && (
                <div class="alert alert-error" role="alert">
                  <span>{create_connect4_match["player_error[0]"]}</span>
                </div>
              )}
            </div>
          </div>
          <div>
            <h3 class="text-3xl">Red Player</h3>
            <div class="form-control">
              <span class="label-text">Type</span>
              <div class="join">
                <input
                  class="join-item btn"
                  type="radio"
                  name="player_type[1]"
                  value="me"
                  aria-label="Me"
                  checked={create_connect4_match["player_type[1]"] === "me"}
                  hx-get="/g/connect4/m/create_match"
                  hx-include="#connect4_create_match_form"
                  hx-target="#connect4_create_match_form"
                  hx-swap="outerHTML"
                />
                <input
                  class="join-item btn"
                  type="radio"
                  name="player_type[1]"
                  value="agent"
                  aria-label="Agent"
                  checked={create_connect4_match["player_type[1]"] === "agent"}
                  hx-get="/g/connect4/m/create_match"
                  hx-include="#connect4_create_match_form"
                  hx-target="#connect4_create_match_form"
                  hx-swap="outerHTML"
                />
              </div>
            </div>
            {player_inputs[1]}
            {create_connect4_match["player_error[1]"] && (
              <div class="alert alert-error" role="alert">
                <span>{create_connect4_match["player_error[1]"]}</span>
              </div>
            )}
          </div>
          <div>
            {create_connect4_match.form_error && (
              <div class="alert alert-error join-item" role="alert">
                <span>{create_connect4_match.form_error}</span>
              </div>
            )}
            <button class="btn btn-rounded-r-full" type="submit">
              Create Match
            </button>
          </div>
        </div>
      </form>
    );
  };

  export const Connect4Match: FC<{
    user: SelectUser | null;
    connect4_match: Connect4MatchView;
  }> = ({ user, connect4_match }) => {
    let header;
    let player: Player | undefined;
    let player_i: number | undefined;

    const current_turn: Connect4CurrentTurn = connect4_match.current_turn;
    switch (current_turn.status.status) {
      case "in_progress": {
        const active_players = current_turn.status.active_players;
        console.assert(active_players.length === 1);
        player_i = active_players[0];
        player = connect4_match.players[player_i];
        if (player !== undefined) {
          if (player_i === 0) {
            header = (
              <div>
                <h2 class="text-4xl">Blue's turn</h2>
                {player?.kind === "user" && player.username === user?.username
                  ? <span class="text-2xl">That's you!</span>
                  : (
                    <span class="text-2xl">
                      Waiting on {player.kind === "user"
                        ? `User: ${player.username}`
                        : `Agent: ${player.username}/${player.agentname}`}
                    </span>
                  )}
              </div>
            );
          } else {
            header = (
              <div>
                <h2 class="text-4xl">Red's turn</h2>
                {player?.kind === "user" && player.username === user?.username
                  ? <span class="text-2xl">That's you!</span>
                  : (
                    <span class="text-2xl">
                      Waiting on {player.kind === "user"
                        ? `User: ${player.username}`
                        : `Agent: ${player.username}/${player.agentname}`}
                    </span>
                  )}
              </div>
            );
          }
        }
        break;
      }
      case "over": {
        header = (
          <div>
            <h2 class="text-4xl">Game Over</h2>
            {current_turn.status.result.kind === "winner" &&
                current_turn.status.result.players[0] === 0
              ? <span class="text-2xl">Blue wins!</span>
              : current_turn.status.result.kind === "winner" &&
                  current_turn.status.result.players[0] === 1
              ? <span class="text-2xl">Red wins!</span>
              : current_turn.status.result.kind === "draw"
              ? <span class="text-2xl">It's a draw!</span>
              : current_turn.status.result.kind === "errored"
              ? (
                <span class="text-2xl">
                  Error: {current_turn.status.result.reason}
                </span>
              )
              : <span class="text-2xl">Error</span>}
          </div>
        );
        break;
      }
      default: {
        throw new Unreachable(current_turn.status);
      }
    }

    return (
      <div>
        {header}
        {/* Build the board with svg. code based on https://codepen.io/rossta/pen/eyrgJe */}
        <svg
          width="350px"
          viewBox="0 0 700 700"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern
              id="cell-pattern"
              patternUnits="userSpaceOnUse"
              width="100"
              height="100"
            >
              <circle cx="50" cy="50" r="45" fill="black" />
            </pattern>
            <mask id="cell-mask">
              <rect width="100" height="600" fill="white" />
              <rect width="100" height="600" fill="url(#cell-pattern)" />
            </mask>
          </defs>
          {player?.kind === "user" && player.username === user?.username && (
            <svg x="0" y="0">
              {[...Array(7)].map((_, col) => {
                const cx = col * 100 + 50;
                const create_turn_url =
                  `/g/connect4/m/${connect4_match.match_id}/turns/create`;
                const hx_vals = JSON.stringify({
                  game: "connect4",
                  column: col,
                });
                const color = player_i === 0 ? "text-blue-400" : "text-red-400";
                return (
                  <g>
                    <circle
                      class={`text-teal-800 hover:${color} fill-current`}
                      cx={cx}
                      cy="50"
                      r="45"
                      hx-post={create_turn_url}
                      hx-target="#match"
                      hx-vals={hx_vals}
                    />
                  </g>
                );
              })}
            </svg>
          )}
          {[...Array(7)].map((_, col) => {
            const x = col * 100;
            return (
              <svg x={x} y="100">
                {[...Array(6)].map((_, row) => {
                  const p = current_turn.state.board[col][row];
                  const row_elems = [];
                  if (p !== null) {
                    const cy = 550 - row * 100;
                    if (p === 0) {
                      row_elems.push(
                        <circle
                          cx="50"
                          cy={cy}
                          r="45"
                          class="text-blue-400 fill-current"
                        />,
                      );
                    } else {
                      row_elems.push(
                        <circle
                          cx="50"
                          cy={cy}
                          r="45"
                          class="text-red-400 fill-current"
                        />,
                      );
                    }
                  }
                  return (
                    <>
                      {row_elems}
                      <rect
                        width="100"
                        height="600"
                        class="text-teal-900 fill-current"
                        mask="url(#cell-mask)"
                      />
                    </>
                  );
                })}
              </svg>
            );
          })}
        </svg>
      </div>
    );
  };
}

export namespace Web {
  import Unreachable = Schema.Unreachable;

  import Url = Schema.Url;
  import SelectUser = Schema.SelectUser;
  import MatchId = Schema.MatchId;

  import GamePlayDB = Schema.GamePlayDB;

  import ClerkUser = Users.ClerkUser;
  import MatchView = Matches.MatchView;

  import CreateConnect4MatchFormData = Connect4Web.CreateConnect4MatchFormData;

  export function sleep(milliseconds = 3000) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  export function background<
    // deno-lint-ignore no-explicit-any
    F extends (...args: any[]) => Promise<any>,
  >(task_name: string, fn: F, ...args: Parameters<F>): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log("Background task:", task_name);
      resolve(Tracing.traceAsync(`background: ${task_name}`, fn, ...args));
    })
      .catch((e) => {
        console.error(`Background task ${task_name} failed:`, e);
      })
      .then(() => {});
  }

  export type ContextVars = {
    // Set by the wrapping app.
    db: GamePlayDB;
    clerk_publishable_key: string;
    clerk_frontend_api: string;
    clerk_jwt_key: string;

    // Set by middleware.
    user?: SelectUser;
  };

  export type GamePlayContext = Context<{ Variables: ContextVars }>;

  const LoggedInNav: FC = () => {
    return (
      <header>
        <div class="navbar bg-base-100" hx-boost="true" hx-target="#main">
          <div class="flex-1">
            <a class="btn btn-ghost text-xl" href="/">
              Gameplay
            </a>
          </div>
          <div class="flex-none">
            <ul class="menu menu-horizontal px-1">
              <li>
                <a class="btn btn-ghost" href="/g">
                  Games
                </a>
              </li>
              <li>
                <a class="btn btn-ghost" href="/g/connect4/m">
                  Matches
                </a>
              </li>
              <li>
                <a class="btn btn-ghost" href="/g/connect4/a">
                  Agents
                </a>
              </li>
              <li>
                <div id="clerk-user"></div>
              </li>
            </ul>
          </div>
        </div>
      </header>
    );
  };

  const LoggedOutNav: FC = () => {
    return (
      <header>
        <div class="navbar bg-base-100" hx-boost="true" hx-target="#main">
          <div class="flex-1">
            <a class="btn btn-ghost text-xl" href="/">
              Gameplay
            </a>
          </div>
          <div class="flex-none">
            <ul class="menu menu-horizontal px-1">
              <li>
                <a
                  class="btn btn-primary"
                  role="button"
                  href="#"
                  onclick="window.Clerk.openSignUp({redirectUrl: '/'})"
                >
                  Sign Up
                </a>
              </li>
              <li>
                <a
                  class="btn"
                  role="button"
                  href="#"
                  onclick="window.Clerk.openSignIn({redirectUrl: '/'})"
                >
                  Log In
                </a>
              </li>
              <li>
                <div id="clerk-user"></div>
              </li>
            </ul>
          </div>
        </div>
      </header>
    );
  };

  const Main: FC<{ children: Child }> = ({ children }) => {
    return (
      <main id="main" class="flex-grow container mx-auto">
        {children}
      </main>
    );
  };

  const Page: FC<{ children: Child }> = ({ children }) => {
    const c: GamePlayContext = useRequestContext();
    const clerk_publishable_key = c.get("clerk_publishable_key");
    const clerk_frontend_api = c.get("clerk_frontend_api");

    const server_signed_in = c.get("user") !== undefined;
    return (
      <html data-theme="lemonade">
        <head>
          <meta charset="utf-8"></meta>
          <meta
            name="viewport"
            content="width=device-width, initial-scale=1.0"
          >
          </meta>
          <title>Gameplay</title>
          <link
            href="https://unpkg.com/@tailwindcss/typography@0.5.0/dist/typography.min.css"
            rel="stylesheet"
            type="text/css"
          >
          </link>
          <link
            href="https://cdn.jsdelivr.net/npm/daisyui@4.7.3/dist/full.min.css"
            rel="stylesheet"
            type="text/css"
          />
          <script src="https://cdn.tailwindcss.com"></script>
          <script src="https://unpkg.com/htmx.org@1.9.11"></script>
          <script src="https://unpkg.com/htmx.org@1.9.11/dist/ext/sse.js">
          </script>
          <script>
            var server_signed_in = {JSON.stringify(server_signed_in)};
          </script>
          {html`
          <script>
            async function loadClerk() {
              await window.Clerk.load();
              if (window.Clerk.user) {
                if (!server_signed_in) {
                  window.location.reload();
                }
                const user_div = document.getElementById("clerk-user");
                user_div.innerHTML = "";
                window.Clerk.mountUserButton(user_div);
              } else {
                if (server_signed_in) {
                  window.location.reload();
                }
              }
            }
          </script>
        `}
          <script
            async
            crossorigin="anonymous"
            data-clerk-publishable-key={clerk_publishable_key}
            src={clerk_frontend_api +
              "/npm/@clerk/clerk-js@4/dist/clerk.browser.js"}
            type="text/javascript"
            onload="loadClerk()"
          >
          </script>
        </head>
        <body class="h-screen flex flex-col">
          {server_signed_in
            ? <LoggedInNav></LoggedInNav>
            : <LoggedOutNav></LoggedOutNav>}
          <Main children={children}></Main>
        </body>
      </html>
    );
  };

  const Layout: FC<{ children: Child }> = ({ children }) => {
    const c = useRequestContext();
    const hx_target = c.req.header("hx-target");
    switch (hx_target) {
      case undefined: {
        const page = <Page children={children}></Page>;
        return html`<!DOCTYPE html>${page}`;
      }
      case "main": {
        return <Main children={children}></Main>;
      }
      default: {
        return <>{children}</>;
      }
    }
  };

  const BreadCrumbs: FC<{
    links: { href: string; text: string }[];
  }> = ({ links }) => {
    return (
      <div class="tx-sm breadcrumbs" hx-boost="true" hx-target="#main">
        <ul>
          {links.map((link) => (
            <li>
              <a href={link.href}>{link.text}</a>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  const Table: FC<{ columns: string[]; rows: JSX.Element[][] }> = ({
    columns,
    rows,
  }) => {
    return (
      <table className="table table-xs">
        <thead>
          <tr>
            {columns.map((column) => <th>{column}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr>
              {row.map((cell) => <td>{cell}</td>)}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            {columns.map((column) => <th>{column}</th>)}
          </tr>
        </tfoot>
      </table>
    );
  };

  export const app = new Hono();

  app.use("*", async (c: GamePlayContext, next) => {
    const session_cookie = getCookie(c, "__session");
    if (session_cookie) {
      const clerk_jwt_key = c.get("clerk_jwt_key")!.replaceAll("|", "\n");
      const jwt_key = await importSPKI(clerk_jwt_key, "RS256");
      try {
        const decoded = await jwtVerify(session_cookie, jwt_key);
        const clerk_user = ClerkUser.parse(decoded.payload);
        const user = await Users.syncClerkUser(c.get("db"), clerk_user);
        c.set("user", user);
      } catch (_e) {
        // console.error("Failed to verify JWT", e);
      }
    }
    await next();
  });

  app.use(
    "*",
    jsxRenderer(({ children }) => <Layout children={children!}></Layout>, {
      docType: false,
    }),
  );

  app.get("/", (c: GamePlayContext) => {
    const user = c.get("user");
    if (user) {
      return c.render(
        <div hx-boost="true" hx-target="#main">
          <p>Hello, {user.username}</p>
          <p>
            <a class="link" href="/g">
              Games
            </a>
          </p>
          <p>
            <a class="link" href="/g/connect4/m">
              Matches
            </a>
          </p>
        </div>,
      );
    } else {
      return c.render(
        <div>
          <span>Log in to get started.</span>
        </div>,
      );
    }
  });

  app.get("/g", (c: GamePlayContext) => {
    return c.render(
      <div>
        <BreadCrumbs links={[{ href: "/g", text: "Games" }]}></BreadCrumbs>
        <div hx-boost="true" hx-target="#main">
          <ul>
            {GameKind.options.map((game) => (
              <li>
                <a class="link text-4xl" href={`/g/${game}`}>
                  {game.charAt(0).toUpperCase() + game.slice(1)}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>,
    );
  });

  app.get("/g/:game", async (c: GamePlayContext) => {
    const parsed_game = GameKind.safeParse(c.req.param("game"));
    if (!parsed_game.success) {
      return c.notFound();
    }
    const game = parsed_game.data;
    const user = c.get("user");
    if (!user) {
      return c.redirect("/");
    }

    const matches = await Matches.findMatchesForGameAndUser(
      c.get("db"),
      game,
      user.user_id,
    );

    const agents = await Agents.findAgentsForGameAndUser(
      c.get("db"),
      game,
      user,
    );

    return c.render(
      <div class="flex flex-col h-full">
        <BreadCrumbs
          links={[
            { href: "/g", text: "Games" },
            {
              href: `/g/${game}`,
              text: game.charAt(0).toUpperCase() + game.slice(1),
            },
          ]}
        >
        </BreadCrumbs>
        <div class="grow">
          <div class="flex">
            <div class="container" hx-boost="true" hx-target="#main">
              <a class="link" href={`/g/${game}/m`}>
                <h2 class="text-4xl">Matches</h2>
              </a>
              <Table
                columns={["Id", "Status", "Your Turn"]}
                rows={matches.map((match) => {
                  return [
                    <a class="link" href={`/g/${game}/m/${match.match_id}`}>
                      {match.match_id}
                    </a>,
                    <span>{match.status.status}</span>,
                    <span>{match.active_player.toString()}</span>,
                  ];
                })}
              >
              </Table>
            </div>
            <div class="container" hx-boost="true" hx-target="#main">
              <a class="link" href={`/g/${game}/a`}>
                <h2 class="text-4xl">Agents</h2>
              </a>
              <Table
                columns={["Id", "Status"]}
                rows={agents.map((agent) => {
                  return [
                    <a class="link" href={`/g/${game}/a/${agent.agent_slug}`}>
                      {agent.agent_slug}
                    </a>,
                    <span>{agent.status_kind}</span>,
                  ];
                })}
              />
            </div>
          </div>
        </div>
      </div>,
    );
  });

  app.get("/g/:game/m", async (c: GamePlayContext) => {
    const parsed_game = GameKind.safeParse(c.req.param("game"));
    if (!parsed_game.success) {
      return c.notFound();
    }
    const game = parsed_game.data;
    const user = c.get("user");
    if (!user) {
      return c.redirect("/");
    }

    const matches = await Matches.findMatchesForGameAndUser(
      c.get("db"),
      game,
      user.user_id,
    );

    const usernames: Name[] = [];
    const agent_slugs = await Agents.findAgentsForGame(c.get("db"), game);

    let form;
    switch (game) {
      case "connect4": {
        form = (
          <Connect4Web.CreateConnect4MatchForm
            user={user}
            usernames={usernames}
            agent_slugs={agent_slugs}
          />
        );
        break;
      }
      default: {
        throw new Unreachable(game);
      }
    }

    return c.render(
      <div class="flex flex-col h-full">
        <BreadCrumbs
          links={[
            { href: "/g", text: "Games" },
            {
              href: `/g/${game}`,
              text: game.charAt(0).toUpperCase() + game.slice(1),
            },
            { href: `/g/${game}/m`, text: "Matches" },
          ]}
        >
        </BreadCrumbs>
        <div class="grow">
          <div class="flex">
            <div class="container">{form}</div>
            <div class="container" hx-boost="true" hx-target="#main">
              <Table
                columns={["Id", "Status", "Your Turn"]}
                rows={matches.map((match) => {
                  return [
                    <a class="link" href={`/g/${game}/m/${match.match_id}`}>
                      {match.match_id}
                    </a>,
                    <span>{match.status.status}</span>,
                    <span>{match.active_player.toString()}</span>,
                  ];
                })}
              >
              </Table>
            </div>
          </div>
        </div>
      </div>,
    );
  });

  app.get("/g/:game/m/create_match", async (c: GamePlayContext) => {
    const parsed_game = GameKind.safeParse(c.req.param("game"));
    if (!parsed_game.success) {
      return c.notFound();
    }
    const game = parsed_game.data;
    const user = c.get("user");
    if (!user) {
      return c.redirect("/");
    }

    const current_data = c.req.query();

    switch (game) {
      case "connect4": {
        const parsed_form = CreateConnect4MatchFormData.safeParse(current_data);
        let form: CreateConnect4MatchFormData | undefined;
        if (parsed_form.success) {
          form = parsed_form.data;
        }

        const usernames: Name[] = [];
        const agent_slugs = await Agents.findAgentsForGame(c.get("db"), game);

        return c.render(
          <Connect4Web.CreateConnect4MatchForm
            user={user}
            usernames={usernames}
            agent_slugs={agent_slugs}
            create_connect4_match={form}
          />,
        );
      }
      default: {
        throw new Unreachable(game);
      }
    }
  });

  app.post("/g/:game/m/create_match", async (c: GamePlayContext) => {
    const parsed_game = GameKind.safeParse(c.req.param("game"));
    if (!parsed_game.success) {
      return c.notFound();
    }
    const game = parsed_game.data;
    const user = c.get("user");
    if (!user) {
      return c.redirect("/");
    }

    const current_data = await c.req.parseBody();

    let match_id;

    switch (game) {
      case "connect4": {
        const usernames: Name[] = [];
        const agent_slugs = await Agents.findAgentsForGame(c.get("db"), game);

        const parsed_form = CreateConnect4MatchFormData.safeParse(current_data);
        if (!parsed_form.success) {
          return c.render(
            <Connect4Web.CreateConnect4MatchForm
              user={user}
              usernames={usernames}
              agent_slugs={agent_slugs}
            />,
          );
        }
        const form = parsed_form.data;

        const {
          new_data,
          error,
          new_match: new_match_spec,
        } = Connect4Web.validateCreateConnect4MatchForm(
          user,
          usernames,
          agent_slugs,
          form,
        );
        if (error) {
          return c.render(
            <Connect4Web.CreateConnect4MatchForm
              user={user}
              usernames={usernames}
              agent_slugs={agent_slugs}
              create_connect4_match={new_data}
            />,
          );
        }

        const { players } = new_match_spec!;
        const new_match = await Matches.createMatch(
          c.get("db"),
          user,
          players,
          "connect4",
        );
        if (new_match instanceof Error) {
          new_data.form_error = new_match.message;

          return c.render(
            <Connect4Web.CreateConnect4MatchForm
              user={user}
              usernames={usernames}
              agent_slugs={agent_slugs}
              create_connect4_match={new_data}
            />,
          );
        }

        match_id = new_match;
        break;
      }
      default: {
        throw new Unreachable(game);
      }
    }

    background("Agent Turn", Matches.takeMatchAgentTurn, c.get("db"), match_id);

    const url = `/g/${game}/m/${match_id}`;
    const redirect = {
      path: url,
      target: "#main",
    };
    c.res.headers.set("HX-Location", JSON.stringify(redirect));
    return c.render(
      <div>
        <span>Created Match, redirecting to {url}</span>
      </div>,
    );
  });

  const Match: FC<{
    user: SelectUser;
    match_view: MatchView;
    children: Child;
  }> = ({ user, match_view, children }): JSX.Element => {
    const game = match_view.game;
    const match_id = match_view.match_id;
    const current_turn = match_view.current_turn;

    if (current_turn.status.status === "in_progress") {
      const player_indexes = new Set();
      for (let i = 0; i < match_view.players.length; i++) {
        const player = match_view.players[i];
        if (player.kind === "user" && player.username === user.username) {
          player_indexes.add(i);
        }
      }
      for (const player_i of current_turn.status.active_players) {
        if (player_indexes.has(player_i)) {
          return (
            <div>
              <div class="container">{children}</div>
            </div>
          );
        }
      }
      // Poll for updates if the player is not active.
      return (
        <div
          hx-get={`/g/${game}/m/${match_id}`}
          hx-trigger="load delay:500ms"
          hx-target="#match"
        >
          {children}
        </div>
      );
    }
    return (
      <div>
        <div class="container">{children}</div>
      </div>
    );
  };

  app.get("/g/:game/m/:match_id", async (c: GamePlayContext) => {
    const parsed_game = GameKind.safeParse(c.req.param("game"));
    if (!parsed_game.success) {
      return c.notFound();
    }
    const game = parsed_game.data;

    const parsed_match_id = MatchId.safeParse(c.req.param("match_id"));
    if (!parsed_match_id.success) {
      return c.notFound();
    }
    const match_id = parsed_match_id.data;

    const user = c.get("user");
    if (!user) {
      return c.redirect("/");
    }

    const match_view = await Matches.fetchMatchById(c.get("db"), match_id);
    if (match_view instanceof Error) {
      return c.notFound();
    }

    background("Agent Turn", Matches.takeMatchAgentTurn, c.get("db"), match_id);

    let inner_view;

    switch (game) {
      case "connect4": {
        inner_view = (
          <Connect4Web.Connect4Match user={user} connect4_match={match_view} />
        );
        break;
      }
      default: {
        throw new Unreachable(game);
      }
    }

    if (c.req.header("hx-target") === "match") {
      return c.render(
        <Match user={user} match_view={match_view}>
          {inner_view}
        </Match>,
      );
    }

    return c.render(
      <div>
        <BreadCrumbs
          links={[
            { href: "/g", text: "Games" },
            { href: `/g/${game}`, text: "Connect4" },
            { href: `/g/${game}/m`, text: "Matches" },
            { href: `/g/${game}/m/${match_id}`, text: match_id },
          ]}
        >
        </BreadCrumbs>
        <div id="match">
          <Match user={user} match_view={match_view}>
            {inner_view}
          </Match>
        </div>
      </div>,
    );
  });

  app.post("/g/:game/m/:match_id/turns/create", async (c: GamePlayContext) => {
    const parsed_game = GameKind.safeParse(c.req.param("game"));
    if (!parsed_game.success) {
      return c.notFound();
    }
    const game = parsed_game.data;
    const user = c.get("user");

    const parsed_match_id = MatchId.safeParse(c.req.param("match_id"));
    if (!parsed_match_id.success) {
      return c.notFound();
    }
    const match_id = parsed_match_id.data;

    if (!user) {
      return c.redirect("/");
    }

    const data = await c.req.parseBody();

    switch (game) {
      case "connect4": {
        const parsed_action = Connect4Action.safeParse(data);
        if (!parsed_action.success) {
          return c.json(
            { ok: false, error: parsed_action.error },
            { status: 400 },
          );
        }
        const action = parsed_action.data;
        const result = await Matches.takeMatchUserTurn(
          c.get("db"),
          user,
          match_id,
          {
            game,
            action,
          },
        );
        if (result instanceof Error) {
          return c.json({ ok: false, error: result }, { status: 400 });
        }
        break;
      }
      default: {
        throw new Unreachable(game);
      }
    }

    const match_view = await Matches.fetchMatchById(c.get("db"), match_id);
    if (match_view instanceof Error) {
      return c.notFound();
    }

    let inner_view;

    switch (game) {
      case "connect4": {
        inner_view = (
          <Connect4Web.Connect4Match user={user} connect4_match={match_view} />
        );
        break;
      }
      default: {
        throw new Unreachable(game);
      }
    }

    background("Agent Turn", Matches.takeMatchAgentTurn, c.get("db"), match_id);

    return c.render(
      <Match user={user} match_view={match_view}>
        {inner_view}
      </Match>,
    );
  });

  type CreateAgentFormDetails = {
    values: {
      agentname: string;
      url: string;
    };
    errors: {
      agentname: string[];
      url: string[];
      form: string[];
    };
  };

  export const CreateConnect4AgentForm: FC<{
    user: SelectUser;
    game: GameKind;
    details: CreateAgentFormDetails;
  }> = ({ user, game, details }) => {
    return (
      <form
        id="create_agent_form"
        hx-post={`/g/${game}/a/create_agent`}
        hx-target="this"
        hx-swap="outerHTML"
      >
        <input type="hidden" name="game" value={game} />
        <div class="container">
          <h2 class="text-4xl">
            Create {game.charAt(0).toUpperCase() + game.slice(1)} Agent
          </h2>
          <div class="form-control">
            <label class="label">
              <span class="label-text">Name</span>
              <input
                class="input input-bordered w-full max-w-xs"
                placeholder="my_agent"
                name="agentname"
                value={details.values.agentname}
              />
            </label>
            {details.errors.agentname.map((error) => (
              <div class="alert alert-error" role="alert">
                <span>{error}</span>
              </div>
            ))}
            <label class="label">
              <span class="label-text">Url</span>
              <input
                type="url"
                class="input input-bordered w-full max-w-xs"
                placeholder={`https://${user.username}-my_agent.web.val.run`}
                name="url"
                value={details.values.url}
              />
            </label>
            {details.errors.url.map((error) => (
              <div class="alert alert-error" role="alert">
                <span>{error}</span>
              </div>
            ))}
          </div>
          <div>
            {details.errors.form.map((error) => (
              <div class="alert alert-error" role="alert">
                <span>{error}</span>
              </div>
            ))}
            <button class="btn btn-rounded-r-full" type="submit">
              Create Agent
            </button>
          </div>
        </div>
      </form>
    );
  };

  export const CreateAgentFormData = z.object({
    game: GameKind,
    agentname: Name,
    url: Url,
  });
  export type CreateAgentFormData = z.infer<typeof CreateAgentFormData>;

  app.post("/g/:game/a/create_agent", async (c: GamePlayContext) => {
    const parsed_game = GameKind.safeParse(c.req.param("game"));
    if (!parsed_game.success) {
      return c.notFound();
    }
    const game = parsed_game.data;
    const user = c.get("user");
    if (!user) {
      return c.redirect("/");
    }

    const body = await c.req.parseBody();
    const parsed_form = CreateAgentFormData.safeParse(body);
    if (!parsed_form.success) {
      const errors = parsed_form.error.format();
      const details = {
        values: {
          agentname: body.agentname?.toString() || "",
          url: body.url?.toString() || "",
        },
        errors: {
          agentname: errors.agentname?._errors || [],
          url: errors.url?._errors || [],
          form: [],
        },
      };

      return c.render(
        <CreateConnect4AgentForm
          user={user}
          game={game}
          details={details}
        >
        </CreateConnect4AgentForm>,
      );
    }

    // todo: validate that the url is publicly accessible before
    // creating the agent, we can just try and hit it here.
    // that should probably be part of createAgent, not here.

    await Agents.createAgent(
      c.get("db"),
      user,
      game,
      parsed_form.data.agentname,
      parsed_form.data.url,
    );
    const agent_slug = user.username + "/" + parsed_form.data.agentname;
    const url = `/g/${game}/a/${agent_slug}`;
    const redirect = {
      path: url,
      target: "#main",
    };
    c.res.headers.set("HX-Location", JSON.stringify(redirect));
    return c.render(
      <div>
        <span>Created Agent, redirecting to {url}</span>
      </div>,
    );
  });

  app.get("/g/:game/a", async (c: GamePlayContext) => {
    const parsed_game = GameKind.safeParse(c.req.param("game"));
    if (!parsed_game.success) {
      return c.notFound();
    }
    const game = parsed_game.data;
    const user = c.get("user");
    if (!user) {
      return c.redirect("/");
    }

    const agents = await Agents.findAgentsForGameAndUser(
      c.get("db"),
      game,
      user,
    );

    return c.render(
      <div class="flex flex-col h-full">
        <BreadCrumbs
          links={[
            { href: "/g", text: "Games" },
            {
              href: `/g/${game}`,
              text: game.charAt(0).toUpperCase() + game.slice(1),
            },
            { href: `/g/${game}/a`, text: "Agents" },
          ]}
        >
        </BreadCrumbs>
        <div class="grow">
          <div class="flex">
            <div class="container">
              <CreateConnect4AgentForm
                user={user}
                game={game}
                details={{
                  values: {
                    agentname: "",
                    url: "",
                  },
                  errors: {
                    agentname: [],
                    url: [],
                    form: [],
                  },
                }}
              />
            </div>
            <div class="container" hx-boost="true" hx-target="#main">
              <Table
                columns={["Id", "Status"]}
                rows={agents.map((agent) => {
                  return [
                    <a class="link" href={`/g/${game}/a/${agent.agent_slug}`}>
                      {agent.agent_slug}
                    </a>,
                    <span>{agent.status_kind}</span>,
                  ];
                })}
              />
            </div>
          </div>
        </div>
      </div>,
    );
  });

  app.get("/g/:game/a/:username/:agentname", async (c: GamePlayContext) => {
    const parsed_game = GameKind.safeParse(c.req.param("game"));
    if (!parsed_game.success) {
      return c.notFound();
    }
    const game = parsed_game.data;

    const parsed_username = Name.safeParse(c.req.param("username"));
    if (!parsed_username.success) {
      return c.notFound();
    }
    const username = parsed_username.data;

    const parsed_agentname = Name.safeParse(c.req.param("agentname"));
    if (!parsed_agentname.success) {
      return c.notFound();
    }
    const agentname = parsed_agentname.data;

    const user = c.get("user");
    if (!user) {
      return c.redirect("/");
    }

    const agent = await Agents.fetchAgentByUsernameAndAgentname(
      c.get("db"),
      username,
      agentname,
    );
    if (agent instanceof Error) {
      return c.notFound();
    }

    return c.render(
      <div class="flex flex-col h-full">
        <BreadCrumbs
          links={[
            { href: "/g", text: "Games" },
            {
              href: `/g/${game}`,
              text: game.charAt(0).toUpperCase() + game.slice(1),
            },
            { href: `/g/${game}/a`, text: "Agents" },
            {
              href: `/g/${game}/a/${agent.slug}`,
              text: agent.slug,
            },
          ]}
        >
        </BreadCrumbs>
        <div class="grow">
          <div>
            <p>Agent</p>
            <p>{agent.slug}</p>
            <p>{agent.status.status}</p>
            <p>{agent.game}</p>
            <p>{agent.username} {agent.user_id}</p>
            <p>{agent.agentname} {agent.agent_id}</p>
            <p>{agent.status}</p>
            <p>{agent.url}</p>
            <p>{agent.created_at}</p>
          </div>
        </div>
      </div>,
    );
  });
}

export default function (req: Request): Response {
  return new Response("hello, world");
}
