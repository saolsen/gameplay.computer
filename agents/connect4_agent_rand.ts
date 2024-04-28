import { GameError, GameKind, JsonObject } from "../gameplay/mod.ts";
import {
  COLS,
  Connect4,
  Connect4Action,
  Connect4AgentResponse,
  Connect4State,
} from "../gameplay/connect4.ts";
import { agentHandler } from "../gameplay/agent.ts";

function rand_action(
  state: Connect4State,
  agent_data?: { counter: number },
): Connect4AgentResponse {
  const counter = agent_data?.counter || 0;

  const player = state.active_player;
  while (true) {
    const column = Math.floor(Math.random() * COLS);
    const action: Connect4Action = { column };
    if (!(Connect4.checkAction(state, player, action) instanceof GameError)) {
      return { action, agent_data: { counter: counter + 1 } };
    }
  }
}

export default agentHandler(
  [
    {
      game: GameKind.Connect4,
      agentname: "random",
      agent: rand_action,
    },
  ],
);
