import { z } from "npm:zod@3.22.4";
import { GamePlayDB, MatchId, Unreachable } from "./schema.ts";
import { attribute, traced } from "./tracing.ts";
import { takeMatchAgentTurn } from "./matches.ts";

export const AgentTurnTask = z.object({
  kind: z.literal("agent_turn"),
  match_id: MatchId,
});
export type AgentTurnTask = z.infer<typeof AgentTurnTask>;
const Task = z.discriminatedUnion("kind", [AgentTurnTask]);
export type Task = z.infer<typeof Task>;

export const processTask = traced("processTask", _processTask);
async function _processTask(
  db: GamePlayDB,
  kv: Deno.Kv,
  task: Task,
): Promise<void> {
  attribute("task", task.kind);
  switch (task.kind) {
    case "agent_turn": {
      await takeMatchAgentTurn(db, kv, task.match_id);
      break;
    }
    default: {
      throw new Unreachable(task.kind);
    }
  }
}

export async function queueTask(kv: Deno.Kv, task: Task): Promise<void> {
  await kv.enqueue(task);
}
