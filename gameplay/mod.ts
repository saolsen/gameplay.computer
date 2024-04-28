/**
 * Error helper for exhaustive switch cases.
 *
 * @example
 * ```ts
 * type X = "a" | "b";
 * const x: X = "a";
 * switch (x) {
 *  case "a": return "A";
 *  case "b": return "B";
 *  default: throw new Unreachable(x);
 * }
 * ```
 *
 * If you add a new case to X, the switch statement will be
 * a type error because you can't assign the new case to the
 * `never` type.
 */
export class Unreachable extends Error {
  constructor(x: never) {
    super(`Unreachable: ${x}`);
  }
}

/** JSON serializable base types. See {@link Json}*/
export type JsonLiteral = string | number | boolean | null;

/**
 * A type representing a JSON object. See {@link Json}
 */
export interface JsonObject {
  /** Index signature */
  [key: string]: Json;
}

/** A type representing a JSON serializable value. */
export type Json = JsonLiteral | JsonObject | Json[];

/** Cloneable base types. See {@link Clone}*/
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

/** A type representing a value that can be cloned with `structuredClone`. */
export type Clone = CloneLiteral | { [key: string]: Clone } | Clone[];

/**
 * The different games.
 * * Used to tag {@link Game}.
 */
export enum GameKind {
  Connect4 = "connect4",
  Poker = "poker",
}

/**
 * The kind of player of a game.
 * * Used to tag {@link Player}.
 */
export enum PlayerKind {
  /** A real person (a user). */
  User = "user",
  /** An agent (a program playing the game). */
  Agent = "agent",
}

/**
 * Player of a game that is a real person (a user).
 */
export interface UserPlayer {
  kind: typeof PlayerKind.User;
  /** The username of the player. */
  username: string;
}

/**
 * Player of a game that is an agent (a program playing the game).
 */
export interface AgentPlayer {
  kind: typeof PlayerKind.Agent;
  /** The username of the user who created the agent. */
  username: string;
  /** The name of the agent. */
  agentname: string;
}

/** A player in a game
 * * {@link UserPlayer}: A real person.
 * * {@link AgentPlayer}: An agent (a program playing the game).
 */
export type Player = UserPlayer | AgentPlayer;

/**
 * The kind of result of a game.
 * * Used to tag {@link Status}.
 */
export enum StatusKind {
  /** The game is still in progress. */
  InProgress = "in_progress",
  /** The game is over. */
  Over = "over",
}

/**
 * Status of a game that is in progress.
 */
export interface InProgress {
  status: typeof StatusKind.InProgress;
  /** The index of the active {@link Player} (the player who's turn it is). */
  active_player: number;
}

/**
 * The kind of result of a game.
 * * Used to tag {@link Result}.
 */
export enum ResultKind {
  /** The game has one or more winners. */
  Winner = "winner",
  /** The game is a draw or a tie. */
  Draw = "draw",
  /** An error occurred in the game, preventing it from finishing. */
  Errored = "errored",
}

/**
 * Result of a game where one or more players won.
 */
export interface Winner {
  kind: typeof ResultKind.Winner;
  /** The indexes of the winning {@link Player}(s). */
  players: number[];
}

/**
 * Result of a game that ended in a draw or a tie.
 */
export interface Draw {
  kind: typeof ResultKind.Draw;
}

/**
 * Result of a game that had an error occur, preventing it from finishing.
 */
export interface Errored {
  kind: typeof ResultKind.Errored;
  /** Error message. */
  reason: string;
}

/** The result of a game.
 * * {@link Winner}: The game has one or more winners.
 * * {@link Draw}: The game is a draw or a tie.
 * * {@link Errored}: An error occurred in the game, preventing it from finishing.
 */
export type Result = Winner | Draw | Errored;

/**
 * Status of a game that is over.
 */
export interface Over {
  status: typeof StatusKind.Over;
  /** The result of the game. */
  result: Result;
}

/** The current status of a game.
 * * {@link InProgress}: The game is still in progress.
 * * {@link Over}: The game is over.
 */
export type Status = InProgress | Over;

/**
 * Arguments for creating a new game.
 */
export interface GameArgs {
  /**
   * The players in the game.
   */
  players: Player[];
}

/**
 * The kind of error that occurred in the game.
 * * Used to tag {@link GameError}.
 */
export enum GameErrorKind {
  /** Error related to the arguments passed in */
  Args = "args",
  /** Error related to the player */
  Player = "player",
  /** Error related to the action */
  Action = "action",
  /** Error related to the game state */
  State = "state",
}

/**
 * An error that can occur in a game.
 * The error has a kind which can be used to determine
 * the type of error that occurred.
 *
 * You can extend this class to create custom game errors.
 * Or you can use it as is.
 */
export class GameError extends Error {
  kind: GameErrorKind;

  constructor(kind: GameErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

/**
 * The type of a game.
 * A game is defined by these functions
 *
 * @template ARGS The type of the game arguments.
 * @template STATE The type of the game state.
 * * Must extend {@link Json} which restricts it to a JSON serializable type.
 * @template ACTION The type of actions that can be taken in the game.
 * * Must extend {@link Json} which restricts it to a JSON serializable type.
 * @template VIEW The type of the player specific view of the state.
 * * Must extend {@link Json} which restricts it to a JSON serializable type.
 * @template ERROR The type of the game error.
 * * Must extend {@link GameError}.
 */
export interface Game<
  ARGS extends GameArgs,
  STATE extends JsonObject,
  ACTION extends JsonObject,
  VIEW extends JsonObject,
  ERROR extends GameError,
> {
  /**
   * Identifier for the game.
   */
  kind: GameKind;
  /**
   * Function for creating a new game.
   *
   * Takes the arguments for creating a new game.
   *
   * Returns a tuple of the initial game state and the initial game status,
   * or an error.
   */
  newGame: (
    create_args: ARGS,
  ) => [STATE, Status] | ERROR;
  /**
   * Function for checking if an action is valid.
   *
   * Takes the current game state, the player making the action,
   * and the action to check.
   *
   * Returns `null` if the action is valid, or an error.
   */
  checkAction: (
    state: STATE,
    player: number,
    action: ACTION,
  ) => null | ERROR;
  /**
   * Function for applying an action to the game state.
   * It should mutate the passed in game state.
   *
   * Takes the current game state, the player making the action,
   * and the action to apply.
   *
   * Returns the new game status, or an error.
   */
  applyAction: (
    state: STATE,
    player: number,
    action: ACTION,
  ) => Status | ERROR;
  /**
   * Function for getting a view of the game state
   * for a particular player.
   * The view type is different from the state type so
   * that elements of the game state can be hidden from
   * the player. For example, a player should not be able
   * to see the other player's cards in a poker game.
   *
   * Takes the current game state and the {@link Player} index.
   *
   * Returns the view of the game state for that player
   * or an error.
   */
  getView: (
    state: STATE,
    player: number,
  ) => VIEW | ERROR;
}
