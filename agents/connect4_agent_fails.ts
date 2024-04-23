import {
  COLS,
  Connect4,
  Connect4Action,
  Connect4State,
  GameError,
} from "../gameplay_computer/games/connect4/connect4.ts";
import { connect4Agent } from "../gameplay_connect4_agent.tsx";

let count = 0;

function rand_action(state: Connect4State): Connect4Action {
  count++;
  if (count > 3) {
    throw new Error("I give up");
  }
  const player = state.next_player;
  while (true) {
    const column = Math.floor(Math.random() * COLS);
    const action: Connect4Action = { column };
    if (!(Connect4.checkAction(state, player, action) instanceof GameError)) {
      return action;
    }
  }
}

export default connect4Agent(rand_action);
