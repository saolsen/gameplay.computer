import { z } from "zod";
import { uuidv7obj } from "uuidv7";
import { Uuid25 } from "uuid25";
import { and, eq } from "drizzle-orm";

import {
  AgentId,
  AgentSlug,
  AgentStatusKind,
  GamePlayDB,
  MatchId,
  NotAllowed,
  NotFound,
  schema,
  SelectAgent,
  SelectUser,
  Todo,
  Unreachable,
  Url,
  UserId,
} from "./schema.ts";
import { GameError, GameKind, Player, Status, Name } from "./game.ts";
import { fetchUserByUsername } from "./users.ts";
import { traced } from "./tracing.ts";

export function agentId(): AgentId {
  return `a_${Uuid25.fromBytes(uuidv7obj().bytes).value}` as AgentId;
}

export const NewAgent = z.object({
  game: GameKind,
  agentname: z.string(),
  url: z.string().url(),
});

export const fetchAgentById = traced("fetchAgentById", _fetchAgentById);
async function _fetchAgentById(
  db: GamePlayDB,
  agent_id: AgentId
): Promise<SelectAgent | NotFound> {
  return new NotFound("agent", agent_id);
}

export const findAgentsForGame = traced(
  "findAgentsForGame",
  _findAgentsForGame
);
async function _findAgentsForGame(
  db: GamePlayDB,
  game: GameKind,
  status: AgentStatusKind = "active"
): Promise<AgentSlug[]> {
  const agent_slugs: AgentSlug[] = [];
  const results = await db
    .select()
    .from(schema.agents)
    .innerJoin(schema.users, eq(schema.agents.user_id, schema.users.user_id))
    .where(
      and(eq(schema.agents.game, game), eq(schema.agents.status_kind, status))
    );
  for (const result of results) {
    agent_slugs.push(
      AgentSlug.parse(result.users.username + "/" + result.agents.agentname)
    );
  }
  return agent_slugs;
}

export const UserAgent = z.object({
  agent_id: AgentId,
});
export type UserAgent = z.infer<typeof UserAgent>;

export const findAgentsForUser = traced(
  "findAgentsForUser",
  _findAgentsForUser
);
async function _findAgentsForUser(
  db: GamePlayDB,
  user: SelectUser
): Promise<UserAgent[]> {
  const results = await db
    .select()
    .from(schema.agents)
    .where(eq(schema.agents.user_id, user.user_id));
  return [];
}

export const findAgentsForGameAndUser = traced(
  "findAgentsForGameAndUser",
  _findAgentsForGameAndUser
);
async function _findAgentsForGameAndUser(
  db: GamePlayDB,
  game: GameKind,
  user: SelectUser
): Promise<UserAgent[]> {
  const results = await db
    .select()
    .from(schema.agents)
    .where(
      and(eq(schema.agents.user_id, user.user_id), eq(schema.agents.game, game))
    );
  return [];
}

export const createAgent = traced("createAgent", _createAgent);
async function _createAgent(
  db: GamePlayDB,
  user: SelectUser,
  game: GameKind,
  agentname: Name,
  url: Url
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
