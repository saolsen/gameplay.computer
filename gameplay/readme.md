# Gameplay Games

[gameplay.computer](https://gameplay.computer) is a site where you can write
agents that play games. You can play against your own and other agents and you
can put agents up against each other to find out which one is the best!

Agents are programs that act as a player of the game. When it's their turn, they
get passed the current game state and they return the action they wish to take.
For instance, in `Connect4`, they would get passed a matrix of the board with
all the current pieces in it, and they would return which column they wish to
drop their next piece into.

[gameplay.computer](https://gameplay.computer) handles all the coordination of
the game and calls agents when it's their turn. It also shows the UI for the
game. You can play against the agents yourself or match them up with other
agents written by yourself or other users.

## @gameplay/games

This package contains game definitions. It describes the types of values that
agents will be passed when it's their turn and the types they must respond with.
It also has all the game logic which can be used by agents to reason about the
current game state or even to simulate potential actions before picking one. For
example, I wrote a `Connect4` agent that uses Monte-Carlo-Tree-Search to
simulate a lot of different potential actions before picking the best one. You
could also use the game definitions to train an agent offline via some sort of
reinforcement learning or any number of techniques.

## QuickStart

The easiest way to get started is with https://val.town.

Paste the following into a new HTTP val.

```ts
import {
  GameError,
  GameKind,
  JsonObject,
} from "https://esm.town/v/saolsen/gameplay_games";
import {
  COLS,
  Connect4,
  Connect4Action,
  Connect4AgentResponse,
  Connect4State,
} from "https://esm.town/v/saolsen/gameplay_connect4";
import { agentHandler } from "https://esm.town/v/saolsen/gameplay_agent";

function rand_action(
  state: Connect4State,
  agent_data?: { counter: number },
): Connect4AgentResponse {
  // This is an example of how you can keep state around, but in this case we
  // aren't doing anything with it.
  const counter = agent_data?.counter || 0;

  // Pick random columns until we find one that has room.
  const player = state.active_player;
  while (true) {
    const column = Math.floor(Math.random() * COLS);
    const action: Connect4Action = { column };
    if (!(Connect4.checkAction(state, player, action) instanceof GameError)) {
      // Return the action to take and any state you want to be passed back on
      // the next turn.
      return { action, agent_data: { counter: counter + 1 } };
    }
  }
}

export default agentHandler(
  [
    {
      game: GameKind.Connect4,
      agentname: "rand",
      agent: rand_action,
    },
  ],
);
```

This is a connect4 agent that picks a random column each turn.

Create a new connect4 agent at https://gameplay.computer/g/connect4/a and paste
in the HTTP endpoint for the Val. It will look something like
https://saolsen-connect4_agent_rand.web.val.run. Give it the same name as you
gave it in the code, in this case, `"rand`"`. Then you can go to
https://gameplay.computer/g/connect4/m and play against it!

## Agents

For details on how to create an agent see the docs for the
[agent](https://jsr.io/@gameplay/games/doc/agent/~) module.
