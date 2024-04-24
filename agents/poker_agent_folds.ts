import {
  PokerAction,
  PokerView,
} from "../gameplay_computer/games/poker/poker.ts";
import { pokerAgent } from "../gameplay_poker_agent.tsx";

function fold_action(view: PokerView): PokerAction {
  if (view.rounds[view.round].bet === 0) {
    return { action: "check" };
  }
  return { action: "fold" };
}

export default pokerAgent(fold_action);
