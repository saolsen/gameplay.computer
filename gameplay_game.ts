import { z } from "npm:zod@3.22.4";

export class Unreachable extends Error {
  constructor(x: never) {
    super(`Unreachable: ${x}`);
  }
}

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

export const GameKind = z.enum(["connect4", "poker"]);
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
  active_player: z.number(),
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

export type NewGame<
  A extends GameArgs,
  STATE extends Json,
  E extends GameError,
> = (
  create_args: A,
) => [STATE, Status] | E;

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
  checkAction: CheckAction<STATE, ACTION, E>;
  applyAction: ApplyAction<STATE, ACTION, E>;
  getView: GetView<STATE, VIEW, E>;
};
