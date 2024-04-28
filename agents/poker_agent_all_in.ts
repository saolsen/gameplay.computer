import { agentHandler } from "../gameplay/agent.ts";
import { GameKind, JsonObject } from "../gameplay/mod.ts";
import {
  PokerAction,
  PokerActionKind,
  PokerAgentResponse,
  PokerView,
} from "../gameplay/poker.ts";

function agent(view: PokerView, _agent_data?: JsonObject): PokerAgentResponse {
  const round = view.rounds[view.round];
  const player = round.active_player;
  const chips = view.player_chips[player];

  const amount_to_call = round.bet - round.player_bets[player];

  if (round.bet === 0) {
    const action: PokerAction = { kind: PokerActionKind.Bet, amount: chips };
    return { action };
  } else if (amount_to_call >= chips) {
    const action: PokerAction = { kind: PokerActionKind.Call };
    return { action };
  } else {
    const raise_amount = chips - amount_to_call;
    const action: PokerAction = {
      kind: PokerActionKind.Raise,
      amount: raise_amount,
    };
    return { action };
  }
}

export default agentHandler(
  [
    {
      game: GameKind.Poker,
      agentname: "all_in",
      agent: agent,
    },
  ],
);
