import { z } from "zod";

import {
  type Card,
  type PokerAction,
  PokerActionKind,
  PokerAgentResponse,
  type PokerState,
  type PokerView,
  Rank,
  type Round,
  RoundPlayerStatus,
  RoundStage,
  type RoundView,
  Suit,
} from "../../../gameplay/poker.ts";
import { GameKind } from "../../../gameplay/mod.ts";
import { JsonSchema } from "../schema.ts";

export const RankSchema: z.Schema<Rank> = z.nativeEnum(Rank);
export const SuitSchema: z.Schema<Suit> = z.nativeEnum(Suit);

export const CardSchema: z.Schema<Card> = z.object({
  rank: RankSchema,
  suit: SuitSchema,
});

export const RoundPlayerStatusSchema: z.ZodType<
  RoundPlayerStatus,
  z.ZodTypeDef,
  RoundPlayerStatus
> = z
  .nativeEnum(RoundPlayerStatus);

export const RoundSchema: z.ZodType<Round, z.ZodTypeDef, Round> = z.object({
  stage: z.nativeEnum(RoundStage),
  deck: z.array(CardSchema),
  table_cards: z.array(CardSchema),
  bet: z.number().nonnegative(),
  pot: z.number().nonnegative(),
  dealer: z.number().nonnegative(),
  active_player: z.number().nonnegative(),
  player_status: z.array(RoundPlayerStatusSchema),
  player_bets: z.array(z.number().nonnegative()),
  player_cards: z.array(z.tuple([CardSchema, CardSchema])),
});

export const PokerStateSchema: z.ZodType<PokerState, z.ZodTypeDef, PokerState> =
  z.object({
    game: z.literal(GameKind.Poker),
    player_chips: z.array(z.number().nonnegative()),
    blinds: z.tuple([z.number().nonnegative(), z.number().nonnegative()]),
    round: z.number().nonnegative(),
    rounds: z.array(RoundSchema),
  });

export const RoundViewSchema: z.ZodType<RoundView, z.ZodTypeDef, RoundView> = z
  .object({
    stage: z.nativeEnum(RoundStage),
    table_cards: z.array(CardSchema),
    bet: z.number().nonnegative(),
    pot: z.number().nonnegative(),
    dealer: z.number().nonnegative(),
    active_player: z.number().nonnegative(),
    player_status: z.array(RoundPlayerStatusSchema),
    player_bets: z.array(z.number().nonnegative()),
    my_cards: z.tuple([CardSchema, CardSchema]),
  });

export const PokerViewSchema: z.ZodType<PokerView, z.ZodTypeDef, PokerView> = z
  .object({
    game: z.literal(GameKind.Poker),
    player_chips: z.array(z.number().nonnegative()),
    blinds: z.tuple([z.number().nonnegative(), z.number().nonnegative()]),
    round: z.number().nonnegative(),
    rounds: z.array(RoundViewSchema),
  });

export const PokerActionKindSchema: z.ZodType<
  PokerActionKind,
  z.ZodTypeDef,
  PokerActionKind
> = z
  .nativeEnum(PokerActionKind);

export const PokerActionSchema: z.ZodType<
  PokerAction,
  z.ZodTypeDef,
  PokerAction
> = z.discriminatedUnion(
  "kind",
  [
    z.object({
      kind: z.literal(PokerActionKind.Fold),
    }),
    z.object({
      kind: z.literal(PokerActionKind.Check),
    }),
    z.object({
      kind: z.literal(PokerActionKind.Bet),
      amount: z.coerce.number().positive(),
    }),
    z.object({
      kind: z.literal(PokerActionKind.Call),
    }),
    z.object({
      kind: z.literal(PokerActionKind.Raise),
      amount: z.coerce.number().positive(),
    }),
  ],
);

export const PokerAgentResponseSchema: z.ZodType<
  PokerAgentResponse,
  z.ZodTypeDef,
  PokerAgentResponse
> = z.object({
  action: PokerActionSchema,
  agent_data: JsonSchema.optional(),
});
