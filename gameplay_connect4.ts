import { z } from "zod";

import { type Game, GameError, Player, Status } from "./gameplay_game.ts";
export { type Game, GameError, Player, Status } from "./gameplay_game.ts";

export const COLS = 7;
export const ROWS = 6;

// each slot can be null (empty), 0 (blue), or 1 (red).
export const Slot = z.nullable(z.number().nonnegative().lte(1));
export type Slot = z.infer<typeof Slot>;

export const Connect4State = z.object({
  game: z.literal("connect4"),
  next_player: z.number().nonnegative().lte(1),
  board: z.array(z.array(Slot).length(ROWS)).length(COLS),
});
export type Connect4State = z.infer<typeof Connect4State>;

export const Connect4Action = z.object({
  column: z.coerce.number().nonnegative().lt(7),
});
export type Connect4Action = z.infer<typeof Connect4Action>;

export type Connect4Args = {
  players: Player[];
};

export function newGame({ players }: Connect4Args): Connect4State | GameError {
  if (players.length !== 2) {
    return new GameError("args", "Connect4 requires exactly 2 players.");
  }

  return {
    game: "connect4",
    next_player: 0,
    board: [
      [null, null, null, null, null, null],
      [null, null, null, null, null, null],
      [null, null, null, null, null, null],
      [null, null, null, null, null, null],
      [null, null, null, null, null, null],
      [null, null, null, null, null, null],
      [null, null, null, null, null, null],
    ],
  };
}

export function get(state: Connect4State, col: number, row: number): Slot {
  return state.board[col][row];
}

export function set(
  state: Connect4State,
  col: number,
  row: number,
  slot: Slot,
): void {
  state.board[col][row] = slot;
}

function check_slots_eq(a: Slot, b: Slot, c: Slot, d: Slot): Slot {
  if (a === b && b === c && c === d) {
    return a;
  }
  return null;
}

export function checkStatus(state: Connect4State): Status | GameError {
  // Check Vertical Win
  for (let col = 0; col < COLS; col++) {
    for (let row = 0; row < 3; row++) {
      const check = check_slots_eq(
        get(state, col, row + 0),
        get(state, col, row + 1),
        get(state, col, row + 2),
        get(state, col, row + 3),
      );
      if (check !== null) {
        return {
          status: "over",
          result: { kind: "winner", players: [check] },
        };
      }
    }
  }
  // Check Horizontal Win
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < 4; col++) {
      const check = check_slots_eq(
        get(state, col + 0, row),
        get(state, col + 1, row),
        get(state, col + 2, row),
        get(state, col + 3, row),
      );
      if (check !== null) {
        return {
          status: "over",
          result: { kind: "winner", players: [check] },
        };
      }
    }
  }
  // Check Diagonal Up Win
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 3; row++) {
      const check = check_slots_eq(
        get(state, col + 0, row + 0),
        get(state, col + 1, row + 1),
        get(state, col + 2, row + 2),
        get(state, col + 3, row + 3),
      );
      if (check !== null) {
        return {
          status: "over",
          result: { kind: "winner", players: [check] },
        };
      }
    }
  }
  // Check Diagonal Down Win
  for (let col = 0; col < 4; col++) {
    for (let row = 3; row < 6; row++) {
      const check = check_slots_eq(
        get(state, col + 0, row - 0),
        get(state, col + 1, row - 1),
        get(state, col + 2, row - 2),
        get(state, col + 3, row - 3),
      );
      if (check !== null) {
        return {
          status: "over",
          result: { kind: "winner", players: [check] },
        };
      }
    }
  }
  // Check For Possible Moves
  for (let col = 0; col < COLS; col++) {
    if (get(state, col, ROWS - 1) === null) {
      return {
        status: "in_progress",
        active_player: state.next_player,
      };
    }
  }
  // No Possible Moves, Draw
  return {
    status: "over",
    result: { kind: "draw" },
  };
}

// Returns null if the action is allowed.
export function checkAction(
  state: Connect4State,
  player: number,
  action: Connect4Action,
): null | GameError {
  if (player !== state.next_player) {
    return new GameError("player", "It is not this player's turn.");
  }
  if (action.column < 0 || action.column >= COLS) {
    return new GameError("action", "Column is out of bounds.");
  }
  if (get(state, action.column, ROWS - 1) !== null) {
    return new GameError("action", "Column is full.");
  }
  return null;
}

export function applyAction(
  state: Connect4State,
  player: number,
  action: Connect4Action,
): Status | GameError {
  const check = checkAction(state, player, action);
  if (check instanceof GameError) {
    return check;
  }
  for (let row = 0; row < ROWS; row++) {
    if (get(state, action.column, row) === null) {
      set(state, action.column, row, player);
      state.next_player = 1 - player;
      return checkStatus(state);
    }
  }
  throw new Error("unreachable");
}

export function getView(
  state: Connect4State,
  _player: number,
): Connect4State | GameError {
  return state;
}

export type Connect4Agent = (state: Connect4State) => Connect4Action;
export type Connect4AsyncAgent = (
  state: Connect4State,
) => Promise<Connect4Action>;

export const Connect4: Game<
  Connect4Args,
  Connect4Action,
  Connect4State,
  Connect4State,
  GameError
> = {
  kind: "connect4",
  newGame,
  checkStatus,
  checkAction,
  applyAction,
  getView,
};
