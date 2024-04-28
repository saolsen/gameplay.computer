import { GameError, GameKind, JsonObject } from "../gameplay/mod.ts";
import {
  COLS,
  Connect4,
  Connect4Action,
  Connect4AgentResponse,
  Connect4State,
} from "../gameplay/connect4.ts";
import { agentHandler } from "../gameplay/agent.ts";

let count = 0;

function rand_action(
  state: Connect4State,
  _agent_data?: JsonObject,
): Connect4AgentResponse {
  count++;
  if (count > 3) {
    throw new Error("I give up");
  }
  const player = state.active_player;
  while (true) {
    const column = Math.floor(Math.random() * COLS);
    const action: Connect4Action = { column };
    if (!(Connect4.checkAction(state, player, action) instanceof GameError)) {
      return { action };
    }
  }
}

export default agentHandler(
  [
    {
      game: GameKind.Connect4,
      agentname: "fails",
      agent: rand_action,
    },
  ],
);
