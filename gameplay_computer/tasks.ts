import { z } from "npm:zod@3.22.4";
import { GamePlayDB, MatchId, Unreachable } from "./schema.ts";
import { attribute, getPropB3, traced, tracer, traceTask } from "./tracing.ts";
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
  msg: { task: Task; b3: string },
): Promise<void> {
  const b3 = msg.b3;
  await traceTask(msg.task.kind, b3, async () => {
    attribute("task", msg.task.kind);
    switch (msg.task.kind) {
      case "agent_turn": {
        await takeMatchAgentTurn(db, kv, msg.task.match_id);
        break;
      }
      default: {
        throw new Unreachable(msg.task.kind);
      }
    }
  });
}

export async function queueTask(kv: Deno.Kv, task: Task): Promise<void> {
  const b3 = getPropB3();
  await kv.enqueue({ task, b3 });
}
