import {
  PokerAction,
  PokerView,
} from "../gameplay_computer/games/poker/poker.ts";
import { pokerAgent } from "../gameplay_poker_agent.tsx";

function agent(view: PokerView): PokerAction {
  const round = view.rounds[view.round];
  const player = round.current_player;
  const chips = view.player_chips[player];

  const amount_to_call = round.bet - round.player_bets[player];

  if (round.bet === 0) {
    const action: PokerAction = { action: "bet", amount: chips };
    return action;
  } else if (amount_to_call >= chips) {
    const action: PokerAction = { action: "call" };
    return action;
  } else {
    const raise_amount = chips - amount_to_call;
    const action: PokerAction = { action: "raise", amount: raise_amount };
    return action;
  }
}

export default pokerAgent(agent);
