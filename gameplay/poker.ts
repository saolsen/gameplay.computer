/**
 * # Poker
 *
 * This module implements a game of poker.
 * The poker game is Texas Hold'em, a variant of poker where each player is
 * dealt two private cards and shares five community cards.
 * This variant is No-Limit 1/2, meaning there is no limit to the amount of
 * chips a player can bet, and there are blinds of 1 and 2 chips, which are the
 * forced bets for the first two players each round.
 *
 * Each player gets 100 chips to start the match. The match plays in a series of
 * rounds, each round is a hand of poker. The match continues until all players
 * except one are out of chips. The remaining player is the winner.
 *
 * * See {@link Poker} for the {@link Game} definition which links
 * to the {@link PokerState} type, the {@link PokerAction} type and the
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
  Unreachable,
} from "./mod.ts";

/**
 * The ranks of the cards in a deck.
 */
export enum Rank {
  AceLow,
  Two,
  Three,
  Four,
  Five,
  Six,
  Seven,
  Eight,
  Nine,
  Ten,
  Jack,
  Queen,
  King,
  Ace,
}

/**
 * The suits of the playing cards.
 */
export enum Suit {
  Clubs,
  Diamonds,
  Hearts,
  Spades,
}

/**
 * A playing card.
 */
export interface Card extends JsonObject {
  /** The rank of the card. */
  rank: Rank;
  /** The suit of the card. */
  suit: Suit;
}

/**
 * The string names for {@link Rank} values.
 */
export const RANK_NAMES = [
  "A",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
  "A",
];

/**
 * The string names for {@link Suit} values.
 */
export const SUIT_NAMES = ["♣", "♦", "♥", "♠"];

/**
 * Helper function to create a {@link Card} from a string.
 *
 * @param {string} s The string representation of the card.
 *
 * @returns {Card} The card.
 */
export function cardFromString(s: string): Card {
  const rank_s = s.slice(0, -1);
  const rank = RANK_NAMES.indexOf(rank_s);
  if (rank === -1) {
    throw new Error(`Invalid rank: ${rank_s}`);
  }
  const suit_s = s.slice(-1);
  const suit = SUIT_NAMES.indexOf(suit_s);
  if (suit === -1) {
    throw new Error(`Invalid suit: ${suit_s}`);
  }
  return { rank: rank as Rank, suit: suit as Suit };
}

/**
 * Helper function to create a string from a {@link Card}.
 *
 * @param {Card} c The card.
 *
 * @returns {string} The string representation of the card.
 */
export function cardToString(c: Card): string {
  return RANK_NAMES[c.rank] + SUIT_NAMES[c.suit];
}

/**
 * A standard deck of playing cards.
 * * The deck is ascending in order from "2♣" to "A♠"
 *
 * @returns {Card[]} A deck of cards.
 */
export function deck(): Card[] {
  const cards: Card[] = [];
  for (let rank: Rank = 0; rank <= Rank.Ace; rank++) {
    if (rank === Rank.AceLow) {
      continue;
    }
    for (let suit: Suit = 0; suit <= Suit.Spades; suit++) {
      cards.push({ rank, suit });
    }
  }
  return cards;
}

/**
 * Shuffle a deck of cards.
 * * The deck is shuffled in place.
 *
 * @param {Card[]} cards The deck of cards to shuffle.
 */
export function shuffle(cards: Card[]) {
  let i = cards.length;
  while (i !== 0) {
    const rand_i = Math.floor(Math.random() * i--);
    [cards[i], cards[rand_i]] = [cards[rand_i], cards[i]];
  }
}

/**
 * The different kinds of poker hands.
 * * Used to tag {@link Hand}.
 */
export enum HandKind {
  HighCard,
  OnePair,
  TwoPair,
  ThreeOfAKind,
  Straight,
  Flush,
  FullHouse,
  FourOfAKind,
  StraightFlush,
}

/**
 * A {@link Hand} without any pairs, straights or flushes.
 *
 * HighCard is the lowest possible hand.
 *
 * HighCard hands are ranked by their card ranks from highest to lowest.
 */
export interface HighCard {
  kind: HandKind.HighCard;
  /** The ranks of the cards in the hand, in descending order. */
  ranks: [Rank, Rank, Rank, Rank, Rank];
}

/**
 * A {@link Hand} with a single pair.
 *
 * OnePair hands are compared by their pair rank and then by the ranks of the
 * other cards in the hand from highest to lowest.
 */
export interface OnePair {
  kind: HandKind.OnePair;
  /** The rank of the pair. */
  two: Rank;
  /** The ranks of the other cards in the hand, in descending order. */
  ranks: [Rank, Rank, Rank];
}

/**
 * A {@link Hand} with two pairs.
 *
 * TwoPair hands are compared by their high pair rank, then by their low pair
 * rank, and then by the rank of the other card in the hand.
 */
export interface TwoPair {
  kind: HandKind.TwoPair;
  /** The rank of the higher ranked pair. */
  high_two: Rank;
  /**The rank of the lower ranked pair. */
  low_two: Rank;
  /** The rank of the other card in the hand. */
  other: Rank;
}

/**
 * A {@link Hand} with three of a kind.
 *
 * ThreeOfAKind hands are compared by their three of a kind rank and then by the
 * ranks of the other cards in the hand from highest to lowest.
 */
export interface ThreeOfAKind {
  kind: HandKind.ThreeOfAKind;
  /** The rank of the three of a kind. */
  three: Rank;
  /** The ranks of the other cards in the hand, in descending order. */
  ranks: [Rank, Rank];
}

/**
 * A {@link Hand} with a straight.
 *
 * Straight hands are compared by the rank of the cards in the straight from
 * highest to lowest.
 */
export interface Straight {
  kind: HandKind.Straight;
  /** The ranks of the cards in the straight, in descending order. */
  ranks: [Rank, Rank, Rank, Rank, Rank];
}

/**
 * A {@link Hand} with a flush.
 *
 * Flush hands are compared by the ranks of the cards in the flush from highest
 * to lowest.
 */
export interface Flush {
  kind: HandKind.Flush;
  /** The ranks of the cards in the flush, in descending order. */
  ranks: [Rank, Rank, Rank, Rank, Rank];
}

/**
 * A {@link Hand} with a full house (Three of a kind and a pair).
 *
 * FullHouse hands are compared by the rank of the three of a kind and then by
 * the rank of the pair.
 */
export interface FullHouse {
  kind: HandKind.FullHouse;
  /** The rank of the three of a kind. */
  three: Rank;
  /** The rank of the pair. */
  two: Rank;
}

/**
 * A {@link Hand} with four of a kind.
 *
 * FourOfAKind hands are compared by the rank of the four of a kind and then by
 * the rank of the other card in the hand.
 */
export interface FourOfAKind {
  kind: HandKind.FourOfAKind;
  /** The rank of the four of a kind. */
  four: Rank;
  /** The rank of the other card in the hand. */
  other: Rank;
}

/**
 * A {@link Hand} with a straight flush.
 *
 * StraightFlush hands are compared by the rank of the cards in the straight
 * flush from highest to lowest.
 */
export interface StraightFlush {
  kind: HandKind.StraightFlush;
  /** The ranks of the cards in the straight flush, in descending order. */
  ranks: [Rank, Rank, Rank, Rank, Rank];
}

/**
 * A poker hand represents and equivalence class of hands that have the same
 * score, rather than a specific set of 5 cards.
 *
 * For instance, two different sets of cards,
 *
 * `["A♠", "Q♠", "8♠", "10♠", "6♣"]` and `["A♥", "Q♥", "10♥", "8♥", "6♣"]`
 *
 * would both be represented by the same hand.
 *
 * ```ts
 * {
 *   kind: HandKind.HighCard,
 *   ranks: [
 *     Rank.Ace,
 *     Rank.Queen,
 *     Rank.Ten,
 *     Rank.Eight,
 *     Rank.Six
 *   ]
 * }
 * ```
 *
 * There are `2,598,960` distinct sets of `5` cards but there are only `7462`
 * distinct hands.
 */
export type Hand =
  | HighCard
  | OnePair
  | TwoPair
  | ThreeOfAKind
  | Straight
  | Flush
  | FullHouse
  | FourOfAKind
  | StraightFlush;

/**
 * Function to compute the {@link Hand} of a list of 5 cards.
 *
 * @param {Card[]} cards The list of 5 cards.
 *
 * @returns {Hand} The hand of the cards.
 */
export function hand(cards: Card[]): Hand {
  if (cards.length !== 5) {
    throw new Error(`Invalid number of cards: ${cards.length}`);
  }
  if (new Set(cards).size !== 5) {
    throw new Error("Duplicate cards");
  }

  cards.sort().reverse();
  let card_ranks = cards.map((c) => c.rank);
  const hand_ranks: Map<Rank, number> = new Map();
  for (const card of cards) {
    const count = hand_ranks.get(card.rank) || 0;
    hand_ranks.set(card.rank, count + 1);
  }
  switch (hand_ranks.size) {
    case 5: {
      const is_flush = new Set(cards.map((c) => c.suit)).size === 1;
      if (
        JSON.stringify(card_ranks) ===
          JSON.stringify([Rank.Ace, Rank.Five, Rank.Four, Rank.Three, Rank.Two])
      ) {
        card_ranks = [Rank.Five, Rank.Four, Rank.Three, Rank.Two, Rank.AceLow];
      }
      const is_straight = card_ranks[0] - card_ranks[4] === 4;
      const ranks = card_ranks as [Rank, Rank, Rank, Rank, Rank];
      if (is_flush && is_straight) {
        return { kind: HandKind.StraightFlush, ranks };
      }
      if (is_flush) {
        return { kind: HandKind.Flush, ranks };
      }
      if (is_straight) {
        return { kind: HandKind.Straight, ranks };
      }
      return { kind: HandKind.HighCard, ranks };
    }
    case 4: {
      let two: Rank | null = null;
      for (const [rank, count] of hand_ranks) {
        if (count === 2) {
          two = rank;
          break;
        }
      }
      const ranks = card_ranks.filter((r) => r !== two!) as [Rank, Rank, Rank];
      return { kind: HandKind.OnePair, two: two!, ranks };
    }
    case 3: {
      let three: Rank | null = null;
      const two_ranks: Rank[] = [];
      for (const [rank, count] of hand_ranks) {
        if (count === 3) {
          three = rank;
          break;
        }
        if (count === 2) {
          two_ranks.push(rank);
        }
      }
      if (three !== null) {
        const ranks = card_ranks.filter((r) => r !== three) as [Rank, Rank];
        return { kind: HandKind.ThreeOfAKind, three, ranks };
      }
      two_ranks.sort();
      const [low_two, high_two] = two_ranks;
      const other = card_ranks.find(
        (r) => r !== low_two && r !== high_two,
      ) as Rank;
      return { kind: HandKind.TwoPair, high_two, low_two, other };
    }
    case 2: {
      let four: Rank | null = null;
      let three: Rank | null = null;
      let two: Rank | null = null;
      for (const [rank, count] of hand_ranks) {
        if (count === 4) {
          four = rank;
          break;
        } else if (count === 3) {
          three = rank;
        } else if (count === 2) {
          two = rank;
        }
      }
      if (four !== null) {
        const other = card_ranks.find((r) => r !== four) as Rank;
        return { kind: HandKind.FourOfAKind, four, other };
      }
      return { kind: HandKind.FullHouse, three: three!, two: two! };
    }
    default: {
      throw new Error("Invalid number of ranks");
    }
  }
}

/**
 * Helper function to compute a value for a {@link Hand} that can be compared
 * to other hands.
 *
 * This is used by {@link compareHands} to determine which hand is better.
 *
 * The value is an array of numbers where the first element is the kind of the
 * hand and the rest of the elements are the relevant ranks of the hand.
 *
 * Since hands are compared by their kind first, the returned list of
 * numbers can be different lengths depending on the kind of the hand. Only
 * if the kinds are the same will the rest of the ranks be compared.
 *
 * @param {Hand} hand The hand to compute the comparison value for.
 *
 * @returns {number[]} The comparison value for the hand.
 */
export function handRank(hand: Hand): number[] {
  const hand_rank: number[] = [hand.kind];
  switch (hand.kind) {
    case HandKind.HighCard:
    case HandKind.Straight:
    case HandKind.Flush:
    case HandKind.StraightFlush: {
      for (const rank of hand.ranks) {
        hand_rank.push(rank);
      }
      break;
    }
    case HandKind.OnePair: {
      hand_rank.push(hand.two);
      for (const rank of hand.ranks) {
        hand_rank.push(rank);
      }
      break;
    }
    case HandKind.TwoPair: {
      hand_rank.push(hand.high_two);
      hand_rank.push(hand.low_two);
      hand_rank.push(hand.other);
      break;
    }
    case HandKind.ThreeOfAKind: {
      hand_rank.push(hand.three);
      for (const rank of hand.ranks) {
        hand_rank.push(rank);
      }
      break;
    }
    case HandKind.FullHouse: {
      hand_rank.push(hand.three);
      hand_rank.push(hand.two);
      break;
    }
    case HandKind.FourOfAKind: {
      hand_rank.push(hand.four);
      hand_rank.push(hand.other);
      break;
    }
    default: {
      throw new Unreachable(hand);
    }
  }
  return hand_rank;
}

/**
 * Comparator function for {@link Hand} values.
 *
 * @param {Hand} a A hand to compare.
 * @param {Hand} b A hand to compare.
 *
 * @returns {number}
 * a negative number if a is better, a positive number if b is better,
 * and 0 if they are equal.
 */
export function compareHands(a: Hand, b: Hand): number {
  const a_rank = handRank(a);
  const b_rank = handRank(b);
  const length = Math.min(a_rank.length, b_rank.length);
  for (let i = 0; i < length; i++) {
    if (a_rank[i] < b_rank[i]) {
      return -1;
    } else if (a_rank[i] > b_rank[i]) {
      return 1;
    }
  }
  return 0;
}

/**
 * Computes the best hand from a list of 7 cards.
 *
 * Checks every possible combination of 5 cards from the 7 and returns the
 * hand with the highest value.
 *
 * @param {Card[]} cards The list of 7 cards.
 *
 * @returns {Hand} The best hand (made from 5 of them) from the cards.
 */
export function bestHand(cards: Card[]): Hand {
  console.assert(cards.length === 7);
  const hand_cards = [];
  for (let i = 0; i <= 2; i++) {
    for (let ii = i + 1; ii <= 3; ii++) {
      for (let iii = ii + 1; iii <= 4; iii++) {
        for (let iv = iii + 1; iv <= 5; iv++) {
          for (let v = iv + 1; v <= 6; v++) {
            const hand = [cards[i], cards[ii], cards[iii], cards[iv], cards[v]];
            hand_cards.push(hand);
          }
        }
      }
    }
  }
  console.assert(hand_cards.length === 21);
  return hand_cards.map(hand).sort(compareHands).reverse()[0];
}

/**
 * The different states of a player in a poker match.
 */
export enum RoundPlayerStatus {
  /** The player is still playing in this round. */
  Playing = "playing",
  /** The player has gone all in, they cannot take any more actions in this
   * round because they are out of chips to bet with.
   */
  AllIn = "all-in",
  /** The player has folded, they are out of this round. */
  Folded = "folded",
  /** The player is out of the match, they are out of chips. */
  Out = "out",
}

/**
 * The different stages of a round of poker.
 */
export enum RoundStage {
  /** The stage before any shared cards are dealt. */
  PreFlop = "preflop",
  /** The stage after the first three shared cards are dealt. */
  Flop = "flop",
  /** The stage after the fourth shared card is dealt. */
  Turn = "turn",
  /** The stage after the fifth shared card is dealt. */
  River = "river",
  /** The stage at the end of the round when all cards are revealed and the pot
   * is awarded to the winning players.
   */
  Showdown = "showdown",
}

/**
 * The state for a round of poker.
 *
 * The match is played in rounds, each round is a hand of poker.
 * The round progresses through the stages of preflop, flop, turn, river, and
 * showdown.
 * At the end of the round, the pot is awarded to the player with the best hand.
 * If there is a tie, the pot is split between the tied players.
 *
 * If there is only one player with chips after a round, they are the winner and
 * the match is over.
 *
 * Otherwise, the dealer button moves to the next player and a new round begins.
 */
export interface Round extends JsonObject {
  /** The stage of the round. */
  stage: RoundStage;
  /** The deck of cards for the round. */
  deck: Card[];
  /** The shared cards on the table. */
  table_cards: Card[];
  /** The current bet amount for the stage. This is the value players must call
   * to continue playing.
   */
  bet: number;
  /** The total amount of chips in the pot. */
  pot: number;
  /** The index of the {@link Player} that is the dealer. */
  dealer: number;
  /** The index of the active {@link Player} (the player who's turn it is). */
  active_player: number;
  /** The status of each player in the round, indexed by {@link Player} index. */
  player_status: RoundPlayerStatus[];
  /** The amount of chips each player has bet in the stage, indexed by
   * {@link Player} index.
   *
   * Chips stay in player_bets until the end of the stage when they are added to
   * the pot.
   */
  player_bets: number[];
  /** The private cards each player has, indexed by {@link Player} index. */
  player_cards: [Card, Card][];
}

/**
 * The state of a poker match.
 */
export interface PokerState extends JsonObject {
  /** poker */
  game: typeof GameKind.Poker;
  /** The amount of chips each player has. */
  player_chips: number[];
  /** The small and big blinds for the match. */
  blinds: [number, number];
  /** The index of the current {@link Round}. */
  round: number;
  /** The list of rounds in the match.
   * * `view.rounds[view.round]` is the current round.
   */
  rounds: Round[];
}

/**
 * The {@link Player} specific view of a round of poker.
 *
 * This view is used to show each player only their own private cards.
 * It hides the deck and other player's private cards.
 */
export interface RoundView extends JsonObject {
  /** The stage of the round. */
  stage: RoundStage;
  /** The shared cards on the table. */
  table_cards: Card[];
  /** The current bet amount for the stage. This is the value players must call
   * to continue playing.
   */
  bet: number;
  /** The total amount of chips in the pot. */
  pot: number;
  /** The index of the {@link Player} that is the dealer. */
  dealer: number;
  /** The index of the active {@link Player} (the player who's turn it is). */
  active_player: number;
  /** The status of each player in the round, indexed by {@link Player} index. */
  player_status: RoundPlayerStatus[];
  /** The amount of chips each player has bet in the stage, indexed by
   * {@link Player} index.
   *
   * Chips stay in player_bets until the end of the stage when they are added to
   * the pot.
   */
  player_bets: number[];
  /** The private cards for the {@link Player} */
  my_cards: [Card, Card];
}

/**
 * The {@link Player} specific view of a poker match.
 *
 * This view is used to show each player only their own private cards.
 * It hides the deck and other player's private cards.
 */
export interface PokerView extends JsonObject {
  /** poker */
  game: typeof GameKind.Poker;
  /** The amount of chips each player has. */
  player_chips: number[];
  /** The small and big blinds for the match. */
  blinds: [number, number];
  /** The index of the current {@link Round}. */
  round: number;
  /** The list of rounds in the match.
   * * `view.rounds[view.round]` is the current round.
   */
  rounds: RoundView[];
}

/**
 * The different kinds of actions a player can take in a round of poker.
 * * Used to tag {@link PokerAction}.
 */
export enum PokerActionKind {
  /** The player folds, they are out of the round. */
  Fold = "fold",
  /** The player checks, they do not bet any chips. */
  Check = "check",
  /** The player bets an amount of chips. */
  Bet = "bet",
  /** The player adds chips up to current bet amount. */
  Call = "call",
  /** The player adds chips up to current bet amount and then
   * some additional chips to raise the bet.
   */
  Raise = "raise",
}

/**
 * The player folds, they are out of the round.
 */
export interface FoldAction extends JsonObject {
  kind: typeof PokerActionKind.Fold;
}

/** The player checks, they do not bet any chips. */
export interface CheckAction extends JsonObject {
  kind: typeof PokerActionKind.Check;
}

/** The player bets an amount of chips. */
export interface BetAction extends JsonObject {
  kind: typeof PokerActionKind.Bet;
  /** The amount of chips to bet. */
  amount: number;
}

/** The player adds chips up to current bet amount. */
export interface CallAction extends JsonObject {
  kind: typeof PokerActionKind.Call;
}

/** The player adds chips up to current bet amount and then some additional
 * chips to raise the bet.
 */
export interface RaiseAction extends JsonObject {
  kind: typeof PokerActionKind.Raise;
  /** The amount of chips to raise the bet by.
   * * The total amount of chips bet will be the amount needed to call + this
   * amount.
   */
  amount: number;
}

/**
 * A player action in a round of poker.
 */
export type PokerAction =
  | FoldAction
  | CheckAction
  | BetAction
  | CallAction
  | RaiseAction;

/**
 * The arguments to create a Poker game.
 */
export interface PokerArgs {
  /** The players of the game.
   * * Must have at least 2 players.
   */
  players: Player[];
}

/**
 * Function to create a new Poker game.
 *
 * @param {PokerArgs} args The arguments to create the game.
 *
 * @returns {[PokerState, Status] | GameError}
 * The initial gamestate and the status of the game,
 * or an error if the arguments are invalid.
 */
export function newGame(
  args: PokerArgs,
): [PokerState, Status] | GameError {
  const { players } = args;
  if (players.length < 2) {
    return new GameError(
      GameErrorKind.Args,
      "Poker requires at least 2 players.",
    );
  }

  const round_deck = deck();
  shuffle(round_deck);

  const player_status: RoundPlayerStatus[] = [];
  const player_chips: number[] = [];
  const player_bets: number[] = [];
  const player_cards: [Card, Card][] = [];

  for (let i = 0; i < players.length; i++) {
    player_status.push(RoundPlayerStatus.Playing);
    player_chips.push(100);
    player_bets.push(0);
    player_cards.push([round_deck.pop()!, round_deck.pop()!]);
  }

  let bet = 0;
  let active_player = 1;

  const round_blinds = players.length === 2 ? [2, 1] : [1, 2];
  const small_blind = Math.min(player_chips[active_player], round_blinds[0]);
  player_chips[active_player] -= small_blind;
  player_bets[active_player] += small_blind;
  bet = small_blind;

  active_player = playerAfter(active_player, player_status)!;

  const big_blind = Math.min(player_chips[active_player], round_blinds[1]);
  player_chips[active_player] -= big_blind;
  player_bets[active_player] += big_blind;
  bet = Math.max(small_blind, big_blind);

  active_player = playerAfter(active_player, player_status)!;

  return [{
    game: GameKind.Poker,
    player_chips,
    blinds: [1, 2],
    round: 0,
    rounds: [{
      stage: RoundStage.PreFlop,
      deck: round_deck,
      table_cards: [],
      bet,
      pot: 0,
      dealer: 0,
      active_player,
      player_status,
      player_bets,
      player_cards,
    }],
  }, { status: StatusKind.InProgress, active_player: active_player }];
}

/**
 * Check if an action is valid.
 *
 * @param {PokerState | PokerView} state The game state.
 * @param {number} player The index of the {@link Player} making the action.
 * @param {PokerAction} action The action to check.
 *
 * @returns {null | GameError} null if the action is valid, or a GameError if it is invalid.
 */
export function checkAction(
  state: PokerState | PokerView,
  player: number,
  action: PokerAction,
): null | GameError {
  if (player !== state.rounds[state.round].active_player) {
    return new GameError(GameErrorKind.Player, "It is not this player's turn.");
  }

  const player_chips = state.player_chips[player];
  const round = state.rounds[state.round];

  switch (action.kind) {
    case PokerActionKind.Fold: {
      break;
    }
    case PokerActionKind.Check: {
      if (round.bet !== round.player_bets[player]) {
        return new GameError(
          GameErrorKind.Action,
          "Cannot check, you have to fold, call, or raise.",
        );
      }
      break;
    }
    case PokerActionKind.Bet: {
      if (round.bet !== 0) {
        return new GameError(
          GameErrorKind.Action,
          "Cannot bet, you have to call or raise.",
        );
      }
      if (action.amount > player_chips) {
        return new GameError(GameErrorKind.Action, "Not enough chips.");
      }
      break;
    }
    case PokerActionKind.Call: {
      if (round.bet === 0) {
        return new GameError(
          GameErrorKind.Action,
          "Nothing to call, check instead.",
        );
      }
      break;
    }
    case PokerActionKind.Raise: {
      if (round.bet === 0) {
        return new GameError(
          GameErrorKind.Action,
          "Nothing to raise, bet instead.",
        );
      }

      const call_amount = round.bet - round.player_bets[player];
      if (call_amount + action.amount > player_chips) {
        return new GameError(GameErrorKind.Action, "Not enough chips.");
      }
      break;
    }
    default: {
      const _: never = action;
    }
  }

  return null;
}

/**
 * Get the index of the next {@link RoundPlayerStatus.Playing} {@link Player}
 * in the round.
 *
 * @param {number | null} player The index of the active player.
 * @param {RoundPlayerStatus[]} player_status The status of each player in the round.
 *
 * @returns {number | null} The index of the next {@link Player}, or null if
 * there are no more {@link RoundPlayerStatus.Playing} players.
 */
function playerAfter(
  player: number | null,
  player_status: RoundPlayerStatus[],
): number | null {
  if (player === null) {
    return null;
  }
  const num_players = player_status.length;
  for (let i = 1; i < num_players; i++) {
    const active_player = (player + i) % num_players;
    if (player_status[active_player] === "playing") {
      return active_player;
    }
  }
  return null;
}

/**
 * Apply an action to the game state.
 * * Mutates the passed in game state.
 * * Handles the logic of the game and moves to the next stage or round when
 * needed.
 *
 * @param {PokerState} state The game state.
 * @param {number} player The index of the {@link Player} making the action.
 * @param {Connect4Action} action The action to apply.
 *
 * @returns {Status | GameError} The status of the game after the action,
 * or an error if the action is invalid.
 */
export function applyAction(
  state: PokerState,
  player: number,
  action: PokerAction,
): Status | GameError {
  const check = checkAction(state, player, action);
  if (check instanceof GameError) {
    return check;
  }

  const round = state.rounds[state.round];
  const num_players = state.player_chips.length;

  switch (action.kind) {
    case PokerActionKind.Fold: {
      round.player_status[player] = RoundPlayerStatus.Folded;
      break;
    }
    case PokerActionKind.Check: {
      break;
    }
    case PokerActionKind.Bet: {
      round.player_bets[player] += action.amount;
      state.player_chips[player] -= action.amount;
      round.bet = action.amount;
      if (state.player_chips[player] === 0) {
        round.player_status[player] = RoundPlayerStatus.AllIn;
      }
      break;
    }
    case PokerActionKind.Call: {
      const call_amount = round.bet - round.player_bets[player];
      if (call_amount >= state.player_chips[player]) {
        // all in
        round.player_bets[player] += state.player_chips[player];
        state.player_chips[player] = 0;
        round.player_status[player] = RoundPlayerStatus.AllIn;
      } else {
        round.player_bets[player] += call_amount;
        state.player_chips[player] -= call_amount;
      }
      break;
    }
    case PokerActionKind.Raise: {
      const call_amount = round.bet - round.player_bets[player];
      round.player_bets[player] += call_amount + action.amount;
      state.player_chips[player] -= call_amount + action.amount;
      round.bet += action.amount;
      if (state.player_chips[player] === 0) {
        round.player_status[player] = RoundPlayerStatus.AllIn;
      }
      break;
    }
    default: {
      const _: never = action;
    }
  }

  const round_player = round.active_player;

  round.active_player = playerAfter(
    round.active_player,
    round.player_status,
  )!;

  let stage_over = false;
  check_stage_over: {
    // TODO: The person who posts the big blind should get a chance to raise
    // before the flop. Right now that's a bug because if it gets back around
    // to him all bets will match and the round will end.

    // If no one else can go, the stage is over.
    if (round.active_player === null) {
      round.active_player = round_player;
      stage_over = true;
      break check_stage_over;
    }

    // If everyone has checked, the stage is over.
    if (
      round.bet === 0 &&
      round.active_player === playerAfter(round.dealer, round.player_status)
    ) {
      stage_over = true;
      break check_stage_over;
    }

    // If everyone except one person has folded, the stage is over.
    if (
      round.player_status.filter((s) => s === "playing" || s === "all-in")
        .length === 1
    ) {
      stage_over = true;
      break check_stage_over;
    }

    // If everyone still playing has bet the same amount, the stage is over.
    if (round.bet !== 0) {
      for (let i = 0; i < state.player_chips.length; i++) {
        if (
          round.player_status[i] === "playing" &&
          round.player_bets[i] < round.bet
        ) {
          break check_stage_over;
        }
      }
      stage_over = true;
    }
  }
  let round_over = false;

  if (stage_over) {
    // Move all bets to the pot
    for (let i = 0; i < num_players; i++) {
      round.pot += round.player_bets[i];
      round.player_bets[i] = 0;
    }

    round.bet = 0;
    round.active_player = playerAfter(
      round.dealer,
      round.player_status,
    )!;

    for (let i = 0; i < num_players; i++) {
      round.pot += round.player_bets[i];
      round.player_bets[i] = 0;
    }

    // If only one player left, the round is over.
    if (playerAfter(round.active_player, round.player_status) === null) {
      // draw remaining cards and go to showdown.
      const num_table_cards = round.table_cards.length;
      for (let i = 0; i < 5 - num_table_cards; i++) {
        round.table_cards.push(round.deck.pop()!);
      }
      round.active_player = round_player;
      round.stage = RoundStage.Showdown;
      round_over = true;
    } else {
      // Move to the next stage.
      switch (round.stage) {
        case RoundStage.PreFlop: {
          round.table_cards.push(round.deck.pop()!);
          round.table_cards.push(round.deck.pop()!);
          round.table_cards.push(round.deck.pop()!);
          round.stage = RoundStage.Flop;
          break;
        }
        case RoundStage.Flop: {
          round.table_cards.push(round.deck.pop()!);
          round.stage = RoundStage.Turn;
          break;
        }
        case RoundStage.Turn: {
          round.table_cards.push(round.deck.pop()!);
          round.stage = RoundStage.River;
          break;
        }
        case RoundStage.River: {
          round.stage = RoundStage.Showdown;
          round_over = true;
          break;
        }
        case RoundStage.Showdown: {
          throw new Error("Invalid stage");
        }
        default: {
          const _: never = round.stage;
        }
      }
    }
  }

  if (!round_over) {
    return {
      status: StatusKind.InProgress,
      active_player: round.active_player,
    };
  }

  // Evaluate the hands and determine the winner.
  const playing_players = [];
  for (let i = 0; i < num_players; i++) {
    if (
      round.player_status[i] === RoundPlayerStatus.Playing ||
      round.player_status[i] === RoundPlayerStatus.AllIn
    ) {
      playing_players.push(i);
    }
  }

  const winning_players = [];

  if (playing_players.length === 1) {
    // Only one player left, they are the winner.
    winning_players.push(playing_players[0]);
  } else {
    // Compare players' hands to determine the winner.
    const active_players = [];
    for (let i = 0; i < playing_players.length; i++) {
      active_players.push({
        player: i,
        hand: bestHand([...round.player_cards[i], ...round.table_cards]),
      });
    }

    active_players.sort((a, b) => compareHands(a.hand, b.hand)).reverse();

    const winning_hand = active_players[0].hand;
    for (let i = 0; i < active_players.length; i++) {
      if (compareHands(active_players[i].hand, winning_hand) === 0) {
        winning_players.push(active_players[i].player);
      }
    }
  }

  if (winning_players.length === 1) {
    const winning_player = winning_players[0];
    state.player_chips[winning_player] += round.pot;
  } else {
    const split_pot = Math.floor(round.pot / winning_players.length);
    for (const player of winning_players) {
      state.player_chips[player] += split_pot;
    }
  }

  // Set up the next round.

  let players_left = 0;
  let winner = 0;
  const next_round_player_status: RoundPlayerStatus[] = [];
  for (let i = 0; i < num_players; i++) {
    const player_status = round.player_status[i];
    if (player_status === "out" || state.player_chips[i] === 0) {
      next_round_player_status.push(RoundPlayerStatus.Out);
    } else {
      players_left++;
      winner = i;
      next_round_player_status.push(RoundPlayerStatus.Playing);
    }
  }

  if (players_left == 1) {
    return {
      status: StatusKind.Over,
      result: {
        kind: ResultKind.Winner,
        players: [winner],
      },
    };
  }

  const next_round_deck = deck();
  shuffle(next_round_deck);

  const next_round_player_bets: number[] = [];
  const next_round_player_cards: [Card, Card][] = [];

  for (let i = 0; i < num_players; i++) {
    next_round_player_bets.push(0);
    if (next_round_player_status[i] === RoundPlayerStatus.Playing) {
      next_round_player_cards.push([
        next_round_deck.pop()!,
        next_round_deck.pop()!,
      ]);
    } else {
      // dummy cards, todo maybe make this a map so we
      // don't have to fill out cards for players that are out.
      next_round_player_cards.push([
        { rank: Rank.AceLow, suit: Suit.Clubs },
        { rank: Rank.AceLow, suit: Suit.Clubs },
      ]);
    }
  }

  const next_round_dealer = playerAfter(
    round.dealer,
    next_round_player_status,
  )!;
  let next_round_active_player = playerAfter(
    next_round_dealer,
    next_round_player_status,
  )!;

  let bet = 0;

  const round_blinds = players_left === 2 ? [2, 1] : [1, 2];
  const small_blind = Math.min(
    state.player_chips[next_round_active_player],
    round_blinds[0],
  );
  state.player_chips[next_round_active_player] -= small_blind;
  next_round_player_bets[next_round_active_player] += small_blind;
  bet = small_blind;

  next_round_active_player = playerAfter(
    next_round_active_player,
    next_round_player_status,
  )!;

  const big_blind = Math.min(
    state.player_chips[next_round_active_player],
    round_blinds[1],
  );
  state.player_chips[next_round_active_player] -= big_blind;
  next_round_player_bets[next_round_active_player] += big_blind;
  bet = Math.max(small_blind, big_blind);

  next_round_active_player = playerAfter(
    next_round_active_player,
    next_round_player_status,
  )!;

  state.round++;
  state.rounds.push({
    stage: RoundStage.PreFlop,
    deck: next_round_deck,
    table_cards: [],
    bet,
    pot: 0,
    dealer: next_round_dealer,
    active_player: next_round_active_player,
    player_status: next_round_player_status,
    player_bets: next_round_player_bets,
    player_cards: next_round_player_cards,
  });

  return {
    status: StatusKind.InProgress,
    active_player: next_round_active_player,
  };
}

/**
 * Get the player specific view of the game state.
 *
 * The view is similar to the game state, but the rounds only show the player's
 * private cards. The other player's private cards and the deck are hidden.
 *
 * @param {PokerState} state The game state.
 * @param {number} player The index of the  {@link Player} to get the view for.
 *
 * @returns {PokerView | GameError} The player's game view.
 */
export function getView(
  state: PokerState,
  player: number,
): PokerView | GameError {
  const rounds = [];
  for (const round of state.rounds) {
    rounds.push({
      stage: round.stage,
      table_cards: round.table_cards,
      bet: round.bet,
      pot: round.pot,
      dealer: round.dealer,
      active_player: round.active_player,
      player_status: round.player_status,
      player_bets: round.player_bets,
      my_cards: round.player_cards[player],
    });
  }
  return {
    ...state,
    rounds,
  };
}

/**
 * Poker Agent Response.
 *
 * @template T The type of the agent data.
 * * Must extend {@link Json} which restricts it to a JSON serializable type.
 */
export interface PokerAgentResponse<
  T extends Json = Json,
> {
  /** The action to take. */
  action: PokerAction;
  /** Optional data to save.
   *
   * This data will be passed back to the agent on the next turn. It allows you
   * to save state between turns.
   */
  agent_data?: T;
}

/**
 * Function type for a Poker Agent.
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
export type PokerAgent<
  T extends Json = Json,
> = (
  state: PokerView,
  agent_data?: T,
) => PokerAgentResponse;

/**
 * Function type for an async Poker Agent.
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
export type PokerAsyncAgent<
  T extends Json = Json,
> = (
  state: PokerView,
  agent_data?: T,
) => Promise<PokerAgentResponse>;

/**
 * Poker {@link Game} Definition.
 */
export const Poker: Game<
  PokerArgs,
  PokerState,
  PokerAction,
  PokerView,
  GameError
> = {
  kind: GameKind.Poker,
  newGame,
  checkAction,
  applyAction,
  getView,
};
