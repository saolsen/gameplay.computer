import { agentHandler } from "../gameplay/agent.ts";
import { GameKind, JsonObject } from "../gameplay/mod.ts";
import {
  PokerActionKind,
  PokerAgentResponse,
  PokerView,
} from "../gameplay/poker.ts";

function fold_action(
  view: PokerView,
  _agent_data?: JsonObject,
): PokerAgentResponse {
  if (view.rounds[view.round].bet === 0) {
    return { action: { kind: PokerActionKind.Check } };
  }
  return { action: { kind: PokerActionKind.Fold } };
}

export default agentHandler(
  [
    {
      game: GameKind.Poker,
      agentname: "folds",
      agent: fold_action,
    },
  ],
);
