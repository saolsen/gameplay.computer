// Texas Hold'em Poker
import { z } from "npm:zod@3.22.4";

import { type Game, GameError, Player, Status } from "./gameplay_game.ts";
export { type Game, GameError, Player, Status } from "./gameplay_game.ts";

export const PokerState = z.object({
  game: z.literal("poker"),
});
export type PokerState = z.infer<typeof PokerState>;

export const PokerView = z.object({
  game: z.literal("poker"),
});
export type PokerView = z.infer<typeof PokerView>;

export const PokerAction = z.object({
  something: z.string(),
});
export type PokerAction = z.infer<typeof PokerAction>;

export type PokerArgs = {
  players: Player[];
};

export function newGame(
  { players }: PokerArgs,
): PokerState | GameError {
  if (players.length < 2) {
    return new GameError("args", "Poker requires at least 2 players.");
  }

  return {
    game: "poker",
  };
}

export function checkStatus(state: PokerState): Status | GameError {
  return {
    status: "in_progress",
    active_player: 0,
  };
}

export function checkAction(
  state: PokerState,
  player: number,
  action: PokerAction,
): null | GameError {
  return null;
}

export function applyAction(
  state: PokerState,
  player: number,
  action: PokerAction,
): Status | GameError {
  return {
    status: "in_progress",
    active_player: 0,
  };
}

export function getView(
  state: PokerState,
  player: number,
): PokerView | GameError {
  return {
    game: "poker",
  };
}

export type PokerAgent = (view: PokerView) => PokerAction;
export type PokerAsyncAgent = (
  view: PokerView,
) => Promise<PokerAction>;

export const Poker: Game<
  PokerArgs,
  PokerAction,
  PokerState,
  PokerView,
  GameError
> = {
  kind: "poker",
  newGame,
  checkStatus,
  checkAction,
  applyAction,
  getView,
};
