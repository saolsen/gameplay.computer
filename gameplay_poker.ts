// Texas Hold'em Poker
import { z } from "npm:zod@3.22.4";

import { type Game, GameError, Player, Status } from "./gameplay_game.ts";
export { type Game, GameError, Player, Status } from "./gameplay_game.ts";

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
      const _: never = hand;
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

export const Round = z.object({
  stage: z.enum(["preflop", "flop", "turn", "river", "showdown"]),
  deck: z.array(Card),
  table_cards: z.array(Card),
  bet: z.number().nonnegative(),
  pot: z.number().nonnegative(),
  dealer: z.number().nonnegative(),
  current_player: z.number().nonnegative(),
  player_status: z.array(z.enum(["active", "folded"])),
  player_bets: z.array(z.number().nonnegative()),
  player_cards: z.array(z.tuple([Card, Card])),
});
export type Round = z.infer<typeof Round>;

export const PokerState = z.object({
  game: z.literal("poker"),
  next_player: z.number().nonnegative(),
  players: z.array(z.object({
    status: z.enum(["playing", "out"]),
    chips: z.number().nonnegative(),
  })),
  blinds: z.tuple([z.number().nonnegative(), z.number().nonnegative()]),
  round: z.number().nonnegative(),
  rounds: z.array(Round),
});
export type PokerState = z.infer<typeof PokerState>;

export const RoundView = z.object({
  stage: z.enum(["preflop", "flop", "turn", "river", "showdown"]),
  table_cards: z.array(Card),
  bet: z.number().nonnegative(),
  pot: z.number().nonnegative(),
  dealer: z.number().nonnegative(),
  current_player: z.number().nonnegative(),
  player_status: z.array(z.enum(["active", "folded"])),
  player_bets: z.array(z.number().nonnegative()),
  my_cards: z.tuple([Card, Card]),
});
export type RoundView = z.infer<typeof RoundView>;

export const PokerView = z.object({
  game: z.literal("poker"),
  next_player: z.number().nonnegative(),
  players: z.array(z.object({
    status: z.enum(["playing", "out"]),
    chips: z.number().nonnegative(),
  })),
  blinds: z.tuple([z.number().nonnegative(), z.number().nonnegative()]),
  round: z.number().nonnegative(),
  rounds: z.array(RoundView),
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
  amount: z.coerce.number().nonnegative(),
});

export const CallAction = z.object({
  action: z.literal("call"),
});

export const RaiseAction = z.object({
  action: z.literal("raise"),
  amount: z.coerce.number().nonnegative(),
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
): PokerState | GameError {
  if (players.length < 2) {
    return new GameError("args", "Poker requires at least 2 players.");
  }

  return {
    game: "poker",
    next_player: 0,
    players: players.map((_) => ({
      status: "playing",
      chips: 100,
    })),
    blinds: [1, 2],
    round: 0,
    rounds: [{
      stage: "flop",
      deck: [],
      table_cards: [
        { rank: "ace", suit: "spades" },
        { rank: "ace", suit: "hearts" },
        { rank: "ace", suit: "clubs" },
      ],
      bet: 0,
      pot: 0,
      dealer: 0,
      current_player: 0,
      player_status: Array.from(
        { length: players.length },
        (_) => "active",
      ),
      player_bets: Array.from({ length: players.length }, () => 0),
      player_cards: Array.from({ length: players.length }, () => [
        { rank: "king", suit: "spades" },
        { rank: "king", suit: "hearts" },
      ]),
    }],
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
  const rounds: RoundView[] = [];
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
  checkStatus,
  checkAction,
  applyAction,
  getView,
};
