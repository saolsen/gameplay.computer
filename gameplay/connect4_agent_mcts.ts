import {
  GameError,
  COLS,
  Connect4State,
  Connect4Action,
  Connect4,
} from "./connect4.ts";
import { connect4Agent } from "./gameplay_connect4_agent.tsx";

const SIMULATIONS = 10000;

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

function score_action(
  current_state: Connect4State,
  action: Connect4Action
): number {
  const player = current_state.next_player;

  // Create a new match with the action applied.
  const next_state = JSON.parse(JSON.stringify(current_state));
  Connect4.applyAction(next_state, player, action);

  // Simulate random games from this state.
  let score = 0;
  for (let i = 0; i < SIMULATIONS; i++) {
    const sim_state = JSON.parse(JSON.stringify(next_state));
    // Play out the rest of the game randomly.
    let status = Connect4.checkStatus(sim_state);
    if (status instanceof GameError) {
      throw status;
    }
    while (status.status === "in_progress") {
      const sim_action = rand_action(sim_state);
      const next_status = Connect4.applyAction(
        sim_state,
        sim_state.next_player,
        sim_action
      );
      if (next_status instanceof GameError) {
        throw next_status;
      }
      status = next_status;
    }
    if (status.result.kind === "winner") {
      if (status.result.players.includes(player)) {
        score += 1;
      } else {
        score -= 1;
      }
    }
  }
  return score / SIMULATIONS;
}

function agent(state: Connect4State): Connect4Action {
  // For each action we could take, simulate multiple random games from the resulting state.
  // Keep track of the number of wins for each action.
  // Pick the action with the highest win rate.
  let max_score = Number.MIN_VALUE;
  let best_action: Connect4Action = { game: "connect4", column: 0 };

  for (let col = 0; col < COLS; col++) {
    const action: Connect4Action = { game: "connect4", column: col };
    const check = Connect4.checkAction(state, state.next_player, action);
    if (!(check instanceof GameError)) {
      const score = score_action(state, action);
      if (score > max_score) {
        max_score = score;
        best_action = action;
      }
    }
  }

  return best_action;
}

export default connect4Agent(agent);
