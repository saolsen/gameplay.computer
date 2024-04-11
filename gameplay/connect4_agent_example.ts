import {
  COLS,
  Connect4,
  Connect4Action,
  Connect4State,
  GameError,
} from "../connect4.ts";
import { connect4Agent } from "./gameplay_connect4_agent.tsx";

function rand_action(state: Connect4State): Connect4Action {
  const player = state.next_player;
  while (true) {
    const column = Math.floor(Math.random() * COLS);
    const action: Connect4Action = { game: "connect4", column };
    if (Connect4.checkAction(state, player, action) instanceof GameError) {
      return action;
    }
  }
}

export default connect4Agent(rand_action);
