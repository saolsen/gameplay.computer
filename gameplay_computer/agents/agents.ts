import { z } from "zod";
import { Uuid25 } from "uuid25";
import { uuidv7obj } from "uuidv7";
import { and, eq } from "drizzle-orm";

import { GameKind } from "../../gameplay/mod.ts";
import { GameKindSchema, NameSchema } from "../gameplay_schemas/schema.ts";

import { traced } from "../tracing.ts";
import {
  AgentId,
  AgentSlug,
  AgentStatus,
  AgentStatusKind,
  GamePlayDB,
  NotFound,
  schema,
  SelectAgent,
  SelectUser,
  Url,
  UserId,
} from "../schema.ts";

export function agentId(): AgentId {
  return `a_${Uuid25.fromBytes(uuidv7obj().bytes).value}` as AgentId;
}

export const AgentView = z.object({
  agent_id: AgentId,
  game: GameKindSchema,
  agentname: NameSchema,
  user_id: UserId,
  username: NameSchema,
  slug: AgentSlug,
  status: AgentStatus,
  url: Url,
  created_at: z.date(),
});
export type AgentView = z.infer<typeof AgentView>;

export const fetchAgentById = traced(
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

export const fetchAgentByUsernameAndAgentname = traced(
  "fetchAgentByUsernameAndAgentname",
  _fetchAgentByUsernameAndAgentname,
);
async function _fetchAgentByUsernameAndAgentname(
  db: GamePlayDB,
  username: string,
  agentname: string,
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

export const findAgentsForGame = traced(
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
  agentname: NameSchema,
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

export const findAgentsForGameAndUser = traced(
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

export const createAgent = traced("createAgent", _createAgent);
async function _createAgent(
  db: GamePlayDB,
  user: SelectUser,
  game: GameKind,
  agentname: string,
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
