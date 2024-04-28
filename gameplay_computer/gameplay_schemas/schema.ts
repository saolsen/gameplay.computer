import { z } from "zod";

import {
  type GameArgs,
  GameErrorKind,
  GameKind,
  Json,
  JsonLiteral,
  JsonObject,
  type Player,
  PlayerKind,
  type Result,
  ResultKind,
  type Status,
  StatusKind,
} from "../../gameplay/mod.ts";

export const JsonLiteralSchema: z.ZodType<JsonLiteral> = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

export const JsonObjectSchema: z.ZodType<JsonObject> = z.lazy(() =>
  z.record(JsonSchema)
);

export const JsonSchema: z.ZodType<Json> = z.lazy(() =>
  z.union([JsonLiteralSchema, z.array(JsonSchema), JsonObjectSchema])
);

export const NameSchema: z.ZodString = z
  .string()
  .regex(/^[a-zA-Z0-9_-]+$/)
  .min(4)
  .max(64);

export const GameKindSchema: z.ZodType<GameKind, z.ZodTypeDef, GameKind> = z
  .nativeEnum(GameKind);

export const PlayerKindSchema: z.ZodType<PlayerKind, z.ZodTypeDef, PlayerKind> =
  z.nativeEnum(
    PlayerKind,
  );

export const PlayerSchema: z.ZodType<Player, z.ZodTypeDef, Player> = z
  .discriminatedUnion("kind", [
    z.object({
      kind: z.literal(PlayerKind.User),
      username: NameSchema,
    }),
    z.object({
      kind: z.literal(PlayerKind.Agent),
      username: NameSchema,
      agentname: NameSchema,
    }),
  ]);

export const StatusKindSchema: z.ZodType<StatusKind, z.ZodTypeDef, StatusKind> =
  z.nativeEnum(
    StatusKind,
  );

export const ResultKindSchema: z.ZodType<ResultKind, z.ZodTypeDef, ResultKind> =
  z.nativeEnum(
    ResultKind,
  );

export const ResultSchema: z.ZodType<Result, z.ZodTypeDef, Result> = z
  .discriminatedUnion("kind", [
    z.object({
      kind: z.literal(ResultKind.Winner),
      players: z.array(z.number()),
    }),
    z.object({
      kind: z.literal(ResultKind.Draw),
    }),
    z.object({
      kind: z.literal(ResultKind.Errored),
      reason: z.string(),
    }),
  ]);

export const StatusSchema: z.ZodType<Status, z.ZodTypeDef, Status> = z
  .discriminatedUnion(
    "status",
    [
      z.object({
        status: z.literal(StatusKind.InProgress),
        active_player: z.number(),
      }),
      z.object({
        status: z.literal(StatusKind.Over),
        result: ResultSchema,
      }),
    ],
  );

export const GameArgsSchema: z.ZodType<GameArgs, z.ZodTypeDef, GameArgs> = z
  .object({
    players: z.array(PlayerSchema),
  });

export const GameErrorKindSchema: z.ZodType<
  GameErrorKind,
  z.ZodTypeDef,
  GameErrorKind
> = z.nativeEnum(
  GameErrorKind,
);
