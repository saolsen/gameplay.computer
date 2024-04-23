// Texas Hold'em Poker
import { z } from "npm:zod@3.22.4";

import { type Game, GameError, Player, Status, Unreachable } from "../game.ts";
export { type Game, GameError, Player, Status } from "../game.ts";

export const RANKS = [
  "ace_low",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "jack",
  "queen",
  "king",
  "ace",
] as const;

export const Rank = z.enum(RANKS);
export type Rank = z.infer<typeof Rank>;

export function compareRanks(a: Rank, b: Rank): number {
  return RANKS.indexOf(a) - RANKS.indexOf(b);
}

export const SUITS = ["clubs", "diamonds", "hearts", "spades"] as const;

export const Suit = z.enum(SUITS);
export type Suit = z.infer<typeof Suit>;

const Card = z.object({
  rank: Rank,
  suit: Suit,
});
export type Card = z.infer<typeof Card>;

const RANK_NAMES: { [key in Rank]: string } = {
  ace_low: "A",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
  ten: "10",
  jack: "J",
  queen: "Q",
  king: "K",
  ace: "A",
};

const SUIT_NAMES: { [key in Suit]: string } = {
  clubs: "♣",
  diamonds: "♢",
  hearts: "♡",
  spades: "♠",
};

export function cardFromString(s: string): Card {
  const rank_s = s.slice(0, -1);
  const rank = Object.keys(RANK_NAMES).find(
    (k) => RANK_NAMES[k as Rank] === rank_s,
  );
  if (rank === undefined) {
    throw new Error(`Invalid rank: ${rank_s}`);
  }
  const suit_s = s.slice(-1);
  const suit = Object.keys(SUIT_NAMES).find(
    (k) => SUIT_NAMES[k as Suit] === suit_s,
  );
  if (suit === undefined) {
    throw new Error(`Invalid suit: ${suit_s}`);
  }
  return { rank: rank as Rank, suit: suit as Suit };
}

export function cardToString(c: Card): string {
  return RANK_NAMES[c.rank] + SUIT_NAMES[c.suit];
}

export function deck(): Card[] {
  const cards: Card[] = [];
  for (const rank of RANKS) {
    if (rank === "ace_low") {
      continue;
    }
    for (const suit of SUITS) {
      cards.push({ rank, suit });
    }
  }
  return cards;
}

export function shuffle(cards: Card[]) {
  let i = cards.length;
  while (i !== 0) {
    const rand_i = Math.floor(Math.random() * i--);
    [cards[i], cards[rand_i]] = [cards[rand_i], cards[i]];
  }
}

const HANDS = [
  "high_card",
  "one_pair",
  "two_pair",
  "three_of_a_kind",
  "straight",
  "flush",
  "full_house",
  "four_of_a_kind",
  "straight_flush",
] as const;

type HandKind = (typeof HANDS)[number];

type HighCard = {
  kind: "high_card";
  ranks: [Rank, Rank, Rank, Rank, Rank];
};

type OnePair = {
  kind: "one_pair";
  two: Rank;
  ranks: [Rank, Rank, Rank];
};

type TwoPair = {
  kind: "two_pair";
  high_two: Rank;
  low_two: Rank;
  other: Rank;
};

type ThreeOfAKind = {
  kind: "three_of_a_kind";
  three: Rank;
  ranks: [Rank, Rank];
};

type Straight = {
  kind: "straight";
  ranks: [Rank, Rank, Rank, Rank, Rank];
};

type Flush = {
  kind: "flush";
  ranks: [Rank, Rank, Rank, Rank, Rank];
};

type FullHouse = {
  kind: "full_house";
  three: Rank;
  two: Rank;
};

type FourOfAKind = {
  kind: "four_of_a_kind";
  four: Rank;
  other: Rank;
};

type StraightFlush = {
  kind: "straight_flush";
  ranks: [Rank, Rank, Rank, Rank, Rank];
};

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

export function hand(cards: Card[]): Hand {
  if (cards.length !== 5) {
    throw new Error(`Invalid number of cards: ${cards.length}`);
  }
  if (new Set(cards).size !== 5) {
    throw new Error("Duplicate cards");
  }

  cards.sort((a, b) => RANKS.indexOf(a.rank) - RANKS.indexOf(b.rank)).reverse();
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
          JSON.stringify(["ace", "five", "four", "three", "two"])
      ) {
        card_ranks = ["five", "four", "three", "two", "ace_low"];
      }
      const is_straight =
        RANKS.indexOf(card_ranks[0]) - RANKS.indexOf(card_ranks[4]) === 4;
      const ranks = card_ranks as [Rank, Rank, Rank, Rank, Rank];
      if (is_flush && is_straight) {
        return { kind: "straight_flush", ranks };
      }
      if (is_flush) {
        return { kind: "flush", ranks };
      }
      if (is_straight) {
        return { kind: "straight", ranks };
      }
      return { kind: "high_card", ranks };
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
      return { kind: "one_pair", two: two!, ranks };
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
        return { kind: "three_of_a_kind", three, ranks };
      }
      two_ranks.sort((a, b) => RANKS.indexOf(a) - RANKS.indexOf(b));
      const [low_two, high_two] = two_ranks;
      const other = card_ranks.find(
        (r) => r !== low_two && r !== high_two,
      ) as Rank;
      return { kind: "two_pair", high_two, low_two, other };
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
        return { kind: "four_of_a_kind", four, other };
      }
      return { kind: "full_house", three: three!, two: two! };
    }
    default: {
      throw new Error("Invalid number of ranks");
    }
  }
}

export function handRank(hand: Hand): number[] {
  const hand_rank = [HANDS.indexOf(hand.kind)];
  switch (hand.kind) {
    case "high_card":
    case "straight":
    case "flush":
    case "straight_flush": {
      for (const rank of hand.ranks) {
        hand_rank.push(RANKS.indexOf(rank));
      }
      break;
    }
    case "one_pair": {
      hand_rank.push(RANKS.indexOf(hand.two));
      for (const rank of hand.ranks) {
        hand_rank.push(RANKS.indexOf(rank));
      }
      break;
    }
    case "two_pair": {
      hand_rank.push(RANKS.indexOf(hand.high_two));
      hand_rank.push(RANKS.indexOf(hand.low_two));
      hand_rank.push(RANKS.indexOf(hand.other));
      break;
    }
    case "three_of_a_kind": {
      hand_rank.push(RANKS.indexOf(hand.three));
      for (const rank of hand.ranks) {
        hand_rank.push(RANKS.indexOf(rank));
      }
      break;
    }
    case "full_house": {
      hand_rank.push(RANKS.indexOf(hand.three));
      hand_rank.push(RANKS.indexOf(hand.two));
      break;
    }
    case "four_of_a_kind": {
      hand_rank.push(RANKS.indexOf(hand.four));
      hand_rank.push(RANKS.indexOf(hand.other));
      break;
    }
    default: {
      throw new Unreachable(hand);
    }
  }
  return hand_rank;
}

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

export const RoundPlayerStatus = z.enum(["playing", "all-in", "folded", "out"]);
export type RoundPlayerStatus = z.infer<typeof RoundPlayerStatus>;

export const Round = z.object({
  stage: z.enum(["preflop", "flop", "turn", "river", "showdown"]),
  deck: z.array(Card),
  table_cards: z.array(Card),
  bet: z.number().nonnegative(),
  pot: z.number().nonnegative(),
  dealer: z.number().nonnegative(),
  current_player: z.number().nonnegative(),
  player_status: z.array(RoundPlayerStatus),
  player_bets: z.array(z.number().nonnegative()),
  player_cards: z.array(z.tuple([Card, Card])),
});
export type Round = z.infer<typeof Round>;

export const PokerState = z.object({
  game: z.literal("poker"),
  player_chips: z.array(z.number().nonnegative()),
  blinds: z.tuple([z.number().nonnegative(), z.number().nonnegative()]),
  round: z.number().nonnegative(),
  rounds: z.array(Round),
});
export type PokerState = z.infer<typeof PokerState>;

export const PokerView = PokerState.omit({
  rounds: true,
}).extend({
  rounds: z.array(
    Round.omit({
      // Hide deck and other players cards.
      deck: true,
      player_cards: true,
    }).extend({
      // Show own cards.
      my_cards: z.tuple([Card, Card]),
    }),
  ),
});
export type PokerView = z.infer<typeof PokerView>;

export const FoldAction = z.object({
  action: z.literal("fold"),
});

export const CheckAction = z.object({
  action: z.literal("check"),
});

export const BetAction = z.object({
  action: z.literal("bet"),
  amount: z.coerce.number().positive(),
});

export const CallAction = z.object({
  action: z.literal("call"),
});

export const RaiseAction = z.object({
  action: z.literal("raise"),
  amount: z.coerce.number().positive(),
});

export const PokerAction = z.discriminatedUnion("action", [
  FoldAction,
  CheckAction,
  BetAction,
  CallAction,
  RaiseAction,
]);
export type PokerAction = z.infer<typeof PokerAction>;

export type PokerArgs = {
  players: Player[];
};

export function newGame(
  { players }: PokerArgs,
): [PokerState, Status] | GameError {
  if (players.length < 2) {
    return new GameError("args", "Poker requires at least 2 players.");
  }

  const round_deck = deck();
  shuffle(round_deck);

  const player_status: RoundPlayerStatus[] = [];
  const player_bets: number[] = [];
  const player_cards: [Card, Card][] = [];

  for (let i = 0; i < players.length; i++) {
    player_status.push("playing");
    player_bets.push(0);
    player_cards.push([round_deck.pop()!, round_deck.pop()!]);
  }

  return [{
    game: "poker",
    player_chips: players.map((_) => 100),
    blinds: [1, 2],
    round: 0,
    rounds: [{
      stage: "preflop",
      deck: round_deck,
      table_cards: [],
      bet: 0,
      pot: 0,
      dealer: 0,
      current_player: 1,
      player_status,
      player_bets,
      player_cards,
    }],
  }, { status: "in_progress", active_player: 1 }];
}

// todo
export function checkStatus(state: PokerState): Status | GameError {
  return {
    status: "in_progress",
    active_player: state.rounds[state.round].current_player,
  };
}

export function checkAction(
  state: PokerState,
  player: number,
  action: PokerAction,
): null | GameError {
  if (player !== state.rounds[state.round].current_player) {
    return new GameError("player", "It is not this player's turn.");
  }

  const player_chips = state.player_chips[player];
  const round = state.rounds[state.round];

  switch (action.action) {
    case "fold": {
      break;
    }
    case "check": {
      if (round.bet !== round.player_bets[player]) {
        return new GameError(
          "action",
          "Cannot check, you have to fold, call, or raise.",
        );
      }
      break;
    }
    case "bet": {
      if (round.bet !== 0) {
        return new GameError(
          "action",
          "Cannot bet, you have to call or raise.",
        );
      }
      if (action.amount > player_chips) {
        return new GameError("action", "Not enough chips.");
      }
      break;
    }
    case "call": {
      if (round.bet === 0) {
        return new GameError("action", "Nothing to call, check instead.");
      }
      break;
    }
    case "raise": {
      if (round.bet === 0) {
        return new GameError("action", "Nothing to raise, bet instead.");
      }

      const call_amount = round.bet - round.player_bets[player];
      if (call_amount + action.amount > player_chips) {
        return new GameError("action", "Not enough chips.");
      }
      break;
    }
    default: {
      const _: never = action;
    }
  }

  return null;
}

function playerAfter(
  player: number | null,
  player_status: RoundPlayerStatus[],
): number | null {
  if (player === null) {
    return null;
  }
  const num_players = player_status.length;
  for (let i = 1; i < num_players; i++) {
    const next_player = (player + i) % num_players;
    if (player_status[next_player] === "playing") {
      return next_player;
    }
  }
  return null;
}

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

  switch (action.action) {
    case "fold": {
      round.player_status[player] = "folded";
      break;
    }
    case "check": {
      break;
    }
    case "bet": {
      round.player_bets[player] += action.amount;
      state.player_chips[player] -= action.amount;
      round.bet = action.amount;
      if (state.player_chips[player] === 0) {
        round.player_status[player] = "all-in";
      }
      break;
    }
    case "call": {
      const call_amount = round.bet - round.player_bets[player];
      if (call_amount >= state.player_chips[player]) {
        // all in
        round.player_bets[player] += state.player_chips[player];
        state.player_chips[player] = 0;
        round.player_status[player] = "all-in";
      } else {
        round.player_bets[player] += call_amount;
        state.player_chips[player] -= call_amount;
      }
      break;
    }
    case "raise": {
      const call_amount = round.bet - round.player_bets[player];
      round.player_bets[player] += call_amount + action.amount;
      state.player_chips[player] -= call_amount + action.amount;
      round.bet += action.amount;
      if (state.player_chips[player] === 0) {
        round.player_status[player] = "all-in";
      }
      break;
    }
    default: {
      const _: never = action;
    }
  }

  round.current_player = playerAfter(
    round.current_player,
    round.player_status,
  )!;

  let stage_over = false;
  check_stage_over: {
    // If no one else can go, the stage is over.
    if (round.current_player === null) {
      stage_over = true;
      break check_stage_over;
    }

    // If everyone has checked, the stage is over.
    if (
      round.bet === 0 &&
      round.current_player === playerAfter(round.dealer, round.player_status)
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
    round.current_player = playerAfter(
      round.dealer,
      round.player_status,
    )!;

    for (let i = 0; i < num_players; i++) {
      round.pot += round.player_bets[i];
      round.player_bets[i] = 0;
    }

    // If only one player left, the round is over.
    if (playerAfter(round.current_player, round.player_status) === null) {
      // draw remaining cards and go to showdown.
      const num_table_cards = round.table_cards.length;
      for (let i = 0; i < 5 - num_table_cards; i++) {
        round.table_cards.push(round.deck.pop()!);
      }
      round.stage = "showdown";
      round_over = true;
    } else {
      // Move to the next stage.
      switch (round.stage) {
        case "preflop": {
          round.table_cards.push(round.deck.pop()!);
          round.table_cards.push(round.deck.pop()!);
          round.table_cards.push(round.deck.pop()!);
          round.stage = "flop";
          break;
        }
        case "flop": {
          round.table_cards.push(round.deck.pop()!);
          round.stage = "turn";
          break;
        }
        case "turn": {
          round.table_cards.push(round.deck.pop()!);
          round.stage = "river";
          break;
        }
        case "river": {
          round.stage = "showdown";
          round_over = true;
          break;
        }
        case "showdown": {
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
      status: "in_progress",
      active_player: round.current_player,
    };
  }

  // Evaluate the hands and determine the winner.
  const playing_players = [];
  for (let i = 0; i < num_players; i++) {
    if (
      round.player_status[i] === "playing" ||
      round.player_status[i] === "all-in"
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
      next_round_player_status.push("out");
    } else {
      players_left++;
      winner = i;
      next_round_player_status.push("playing");
    }
  }

  if (players_left == 1) {
    return {
      status: "over",
      result: {
        kind: "winner",
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
    if (next_round_player_status[i] === "playing") {
      next_round_player_cards.push([
        next_round_deck.pop()!,
        next_round_deck.pop()!,
      ]);
    } else {
      // dummy cards, todo maybe make this a map so we
      // don't have to fill out cards for players that are out.
      next_round_player_cards.push([
        { rank: "ace_low", suit: "clubs" },
        { rank: "ace_low", suit: "clubs" },
      ]);
    }
  }

  const next_round_dealer = playerAfter(
    round.dealer,
    next_round_player_status,
  )!;
  const next_round_current_player = playerAfter(
    next_round_dealer,
    next_round_player_status,
  )!;

  state.round++;
  state.rounds.push({
    stage: "preflop",
    deck: next_round_deck,
    table_cards: [],
    bet: 0,
    pot: 0,
    dealer: next_round_dealer,
    current_player: next_round_current_player,
    player_status: next_round_player_status,
    player_bets: next_round_player_bets,
    player_cards: next_round_player_cards,
  });

  return {
    status: "in_progress",
    active_player: next_round_current_player,
  };
}

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
      current_player: round.current_player,
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
  checkAction,
  applyAction,
  getView,
};
