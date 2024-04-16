import { z } from "zod";

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

export async function processTask(
  db: GamePlayDB,
  kv: Deno.Kv,
  msg: { task: Task; b3: string },
): Promise<void> {
  const b3 = msg.b3;
  return await traceTask(msg.task.kind, b3, async () => {
    attribute("task", msg.task.kind);
    switch (msg.task.kind) {
      case "agent_turn": {
        const next_turn_agent = await takeMatchAgentTurn(
          db,
          kv,
          msg.task.match_id,
        );
        // queue another task if the next turn is agent.
        if (next_turn_agent) {
          await queueTask(kv, {
            kind: "agent_turn",
            match_id: msg.task.match_id,
          }, b3);
        }
        break;
      }
      default: {
        throw new Unreachable(msg.task.kind);
      }
    }
  });
}

export async function queueTask(
  kv: Deno.Kv,
  task: Task,
  b3: string | null = null,
): Promise<void> {
  if (b3 === null) {
    b3 = getPropB3();
  }
  await kv.enqueue({ task, b3 });
}
