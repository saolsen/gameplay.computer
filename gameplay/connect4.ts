/**
 * # Connect4
 *
 * This module implements the game Connect4.
 *
 * Two players take turns dropping pieces into a 7x6 grid.
 * The chips fall down to the lowest empty row in the column.
 * The first player to get 4 of their pieces in a row (horizontally, vertically,
 * or diagonally) wins.
 *
 * See {@link Connect4} for the {@link Game} definition which links
 * to the {@link Connect4State} type, the {@link Connect4Action} type and the
 * update logic {@link checkAction}.
 *
 * @module
 */

import {
  type Game,
  GameError,
  GameErrorKind,
  GameKind,
  type Json,
  type JsonObject,
  type Player,
  ResultKind,
  type Status,
  StatusKind,
} from "./mod.ts";

/** Number of columns on the board. */
export const COLS = 7;
/** Number of rows on the board. */
export const ROWS = 6;

/** Type for each slot in the board.
 * * `null`: Empty slot.
 * * `0`: Slot taken by  {@link Player} `0` (Blue).
 * * `1`: Slot taken by  {@link Player} `1` (Red).
 */
export type Slot = null | 0 | 1;

/**
 * State of a Connect4 game.
 */
export interface Connect4State extends JsonObject {
  /** connect4 */
  game: typeof GameKind.Connect4;
  /** The index of the active {@link Player} (the player who's turn it is). */
  active_player: number;
  /** The board of the game.
   *  * The board is a 2D array of {@link Slot}.
   *  * The first index is the column and the second index is the row.
   *  See {@link get} and {@link set} for helper functions
   *  to access the board by column and row.
   */
  board: Slot[][];
}

/**
 * An action in a Connect4 game.
 */
export interface Connect4Action extends JsonObject {
  /** The column to place the piece in.
   * * Must be between 0 and 6.
   * The piece will be placed in the lowest empty row in the column.
   */
  column: number;
}

/**
 * The arguments to create a Connect4 game.
 */
export interface Connect4Args {
  /** The players of the game.
   * * Must have exactly 2 players.
   */
  players: Player[];
}

/**
 * Function to create a new Connect4 game.
 *
 * @param {Connect4Args} args The arguments to create the game.
 *
 * @returns {[Connect4State, Status] | GameError}
 * The initial gamestate and the status of the game,
 * or an error if the arguments are invalid.
 */
export function newGame(
  args: Connect4Args,
): [Connect4State, Status] | GameError {
  const { players } = args;
  if (players.length !== 2) {
    return new GameError(
      GameErrorKind.Args,
      "Connect4 requires exactly 2 players.",
    );
  }

  return [{
    game: GameKind.Connect4,
    active_player: 0,
    board: [
      [null, null, null, null, null, null],
      [null, null, null, null, null, null],
      [null, null, null, null, null, null],
      [null, null, null, null, null, null],
      [null, null, null, null, null, null],
      [null, null, null, null, null, null],
      [null, null, null, null, null, null],
    ],
  }, { status: StatusKind.InProgress, active_player: 0 }];
}

/**
 * Helper function to get the slot at a column and row.
 *
 * @param {Connect4State} state The game state.
 * @param {number} col The column. Must be between 0 and 6.
 * @param {number} row The row. Must be between 0 and 5.
 *
 * @returns {Slot} The slot at the column and row.
 */
export function get(state: Connect4State, col: number, row: number): Slot {
  return state.board[col][row];
}

/**
 * Helper function to set the slot at a column and row.
 *
 * @param {Connect4State} state The game state.
 * @param {number} col The column. Must be between 0 and 6.
 * @param {number} row The row. Must be between 0 and 5.
 * @param {Slot} slot The value to set it to.
 */
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

/**
 * Get the status of the game.
 * Checks every possible span of 4 slots for a win.
 * If no win is found, checks for a draw.
 * If no draw is found, the game is still in progress.
 *
 * @param {Connect4State} state The game state.
 *
 * @returns {Status | GameError} The status of the game,
 * or an error if the game state is invalid.
 */
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
          status: StatusKind.Over,
          result: { kind: ResultKind.Winner, players: [check] },
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
          status: StatusKind.Over,
          result: { kind: ResultKind.Winner, players: [check] },
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
          status: StatusKind.Over,
          result: { kind: ResultKind.Winner, players: [check] },
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
          status: StatusKind.Over,
          result: { kind: ResultKind.Winner, players: [check] },
        };
      }
    }
  }
  // Check For Possible Moves
  for (let col = 0; col < COLS; col++) {
    if (get(state, col, ROWS - 1) === null) {
      return {
        status: StatusKind.InProgress,
        active_player: state.active_player,
      };
    }
  }
  // No Possible Moves, Draw
  return {
    status: StatusKind.Over,
    result: { kind: ResultKind.Draw },
  };
}

/**
 * Check if an action is valid.
 *
 * @param {Connect4State} state The game state.
 * @param {number} player The index of the {@link Player} making the action.
 * @param {Connect4Action} action The action to check.
 *
 * @returns {null | GameError} null if the action is valid, or a GameError if it is invalid.
 */
export function checkAction(
  state: Connect4State,
  player: number,
  action: Connect4Action,
): null | GameError {
  if (player !== state.active_player) {
    return new GameError(GameErrorKind.Player, "It is not this player's turn.");
  }
  if (action.column < 0 || action.column >= COLS) {
    return new GameError(GameErrorKind.Action, "Column is out of bounds.");
  }
  if (get(state, action.column, ROWS - 1) !== null) {
    return new GameError(GameErrorKind.Action, "Column is full.");
  }
  return null;
}

/**
 * Apply an action to the game state.
 * * Mutates the passed in game state.
 * * Places the player's piece in the lowest empty row in the column.
 *
 * @param {Connect4State} state The game state.
 * @param {number} player The index of the {@link Player} making the action.
 * @param {Connect4Action} action The action to apply.
 *
 * @returns {Status | GameError} The status of the game after the action,
 * or an error if the action is invalid.
 */
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
      set(state, action.column, row, player as Slot);
      state.active_player = 1 - player;
      return checkStatus(state);
    }
  }
  throw new Error("unreachable");
}

/**
 * Get the player specific view of the game state.
 * This function is required to define a {@link Game},
 * but Connect4 does not have a player specific view because
 * all players can see the entire board.
 * So it just returns the game state.
 *
 * @param {Connect4State} state The game state.
 * @param {number} _player The index of the  {@link Player} to get the view for.
 *
 * @returns {Connect4State | GameError} The game state.
 */
export function getView(
  state: Connect4State,
  _player: number,
): Connect4State | GameError {
  return state;
}

/**
 * Connect4 Agent Response.
 *
 * @template T The type of the agent data.
 * * Must extend {@link Json} which restricts it to a JSON serializable type.
 */
export interface Connect4AgentResponse<
  T extends Json = Json,
> {
  /** The action to take. */
  action: Connect4Action;
  /** Optional data to save.
   *
   * This data will be passed back to the agent on the next turn. It allows you
   * to save state between turns.
   */
  agent_data?: T;
}

/**
 * Function type for a Connect4 Agent.
 *
 * * Takes the current game state and optional agent data.
 * * Returns a response with the action to take and optional agent data to save.
 *
 * On the first turn, `agent_data` will be `undefined`.
 *
 * On subsequent turns, `agent_data` will be the data returned by the agent's
 * previous turn.
 *
 * If the agent did not return `agent_data`, it will be `undefined`.
 *
 * To keep `agent_data` between turns, it must be returned in the response each
 * time, even if it is not modified.
 *
 * @template T The type of the agent data.
 * * Must extend {@link Json} which restricts it to a JSON serializable type.
 */
export type Connect4Agent<
  T extends Json = Json,
> = (
  state: Connect4State,
  agent_data?: T,
) => Connect4AgentResponse;

/**
 * Function type for an async Connect4 Agent.
 *
 * * Takes the current game state and optional agent data.
 * * Returns a response with the action to take and optional agent data to save.
 *
 * On the first turn, `agent_data` will be `undefined`.
 *
 * On subsequent turns, `agent_data` will be the data returned by the agent's
 * previous turn.
 *
 * If the agent did not return `agent_data`, it will be `undefined`.
 *
 * To keep `agent_data` between turns, it must be returned in the response each
 * time, even if it is not modified.
 *
 * @template T The type of the agent data.
 * * Must extend {@link Json} which restricts it to a JSON serializable type.
 */
export type Connect4AsyncAgent<
  T extends Json = Json,
> = (
  state: Connect4State,
  agent_data?: T,
) => Promise<Connect4AgentResponse>;

/**
 * Connect4 {@link Game} Definition.
 */
export const Connect4: Game<
  Connect4Args,
  Connect4State,
  Connect4Action,
  Connect4State,
  GameError
> = {
  kind: GameKind.Connect4,
  newGame,
  checkAction,
  applyAction,
  getView,
};
