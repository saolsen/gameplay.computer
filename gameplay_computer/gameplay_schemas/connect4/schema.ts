import { z } from "zod";

import {
  COLS,
  type Connect4Action,
  Connect4AgentResponse,
  type Connect4State,
  ROWS,
  type Slot,
} from "../../../gameplay/connect4.ts";
import { GameKind } from "../../../gameplay/mod.ts";
import { JsonSchema } from "../schema.ts";

export const SlotSchema: z.ZodType<Slot, z.ZodTypeDef, Slot> = z.union([
  z.null(),
  z.literal(0),
  z.literal(1),
]);

export const Connect4StateSchema: z.ZodType<
  Connect4State,
  z.ZodTypeDef,
  Connect4State
> = z.object({
  game: z.literal(GameKind.Connect4),
  active_player: z.number().nonnegative().lte(1),
  board: z.array(z.array(SlotSchema).length(ROWS)).length(COLS),
});

export const Connect4ActionSchema: z.ZodType<
  Connect4Action,
  z.ZodTypeDef,
  Connect4Action
> = z.object({
  column: z.coerce.number().nonnegative().lt(7),
});

export const Connect4AgentResponseSchema: z.ZodType<
  Connect4AgentResponse,
  z.ZodTypeDef,
  Connect4AgentResponse
> = z.object({
  action: Connect4ActionSchema,
  agent_data: JsonSchema.optional(),
});
