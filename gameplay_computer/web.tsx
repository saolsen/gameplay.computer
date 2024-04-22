/** @jsxImportSource hono/jsx */
import { z } from "zod";
import { importSPKI, jwtVerify } from "jose";
import { Context, Hono } from "hono";
import { Child, FC } from "npm:hono@4.2.2/jsx";
import { jsxRenderer, useRequestContext } from "hono/jsx-renderer";
import { html } from "hono/html";
import { getCookie } from "hono/cookie";
import { streamSSE } from "hono/streaming";

import { GameKind, Name, Player, Unreachable } from "../gameplay_game.ts";
import { Connect4Action } from "../gameplay_connect4.ts";
import { cardToString, PokerAction } from "../gameplay_poker.ts";

import { GamePlayDB, MatchId, SelectUser, Url } from "./schema.ts";
import { ClerkUser, syncClerkUser } from "./users.ts";
import {
  createAgent,
  fetchAgentByUsernameAndAgentname,
  findAgentsForGame,
  findAgentsForGameAndUser,
} from "./agents.ts";
import {
  Connect4CurrentTurn,
  Connect4MatchView,
  createMatch,
  fetchMatchById,
  findMatchesForGameAndUser,
  MatchView,
  PokerCurrentTurn,
  PokerMatchView,
  takeMatchUserTurn,
} from "./matches.ts";
import { queueTask } from "./tasks.ts";

export const CreateConnect4MatchFormData = z.object({
  game: z.literal("connect4"),
  "player_type[0]": z.union([z.literal("me"), z.literal("agent")]),
  "player_name[0]": z.string(),
  "player_type[1]": z.union([z.literal("me"), z.literal("agent")]),
  "player_name[1]": z.string(),
  "player_error[0]": z.string().optional(),
  "player_error[1]": z.string().optional(),
  form_error: z.string().optional(),
});
export type CreateConnect4MatchFormData = z.infer<
  typeof CreateConnect4MatchFormData
>;

// Todo: can probably do validation outside of the component now.
export function validateCreateConnect4MatchForm(
  user: SelectUser,
  usernames: string[], // usernames
  agent_slugs: string[], // username/agentname
  data: CreateConnect4MatchFormData,
): {
  new_data: CreateConnect4MatchFormData;
  error: boolean;
  new_match?: {
    players: Player[];
  };
} {
  const player_inputs = [
    {
      player_type: data["player_type[0]"],
      player_name: data["player_name[0]"],
    },
    {
      player_type: data["player_type[1]"],
      player_name: data["player_name[1]"],
    },
  ];

  let error = false;
  const players: Player[] = [];
  const player_errors: string[] = ["", ""];

  for (let i = 0; i < 2; i++) {
    const player_type = player_inputs[i].player_type;
    const player_name = player_inputs[i].player_name;
    switch (player_type) {
      case "me": {
        // name must be the user's name.
        const parsed_username = Name.safeParse(player_name);
        if (!parsed_username.success) {
          error = true;
          player_errors[i] = "Invalid username.";
          break;
        }
        const username = parsed_username.data;
        if (username !== user.username) {
          error = true;
          player_errors[i] = "Invalid username.";
          break;
        }

        players.push({
          kind: "user",
          username,
        });
        break;
      }
      case "agent": {
        if (!agent_slugs.includes(player_name)) {
          error = true;
          player_errors[i] = "Invalid agent name.";
          break;
        }

        const split = player_name.split("/");
        if (split.length !== 2) {
          error = true;
          player_errors[i] = "Invalid agent name.";
          break;
        }

        const [username_s, agentname_s] = split;
        const parsed_username = Name.safeParse(username_s);
        if (!parsed_username.success) {
          error = true;
          player_errors[i] = "Invalid agent name.";
          break;
        }
        const username = parsed_username.data;

        const parsed_agentname = Name.safeParse(agentname_s);
        if (!parsed_agentname.success) {
          error = true;
          player_errors[i] = "Invalid agent name.";
          break;
        }
        const agentname = parsed_agentname.data;

        players.push({
          kind: "agent",
          username,
          agentname,
        });
        break;
      }
      default: {
        throw new Unreachable(player_type);
      }
    }
  }

  data["player_error[0]"] = player_errors[0];
  data["player_error[1]"] = player_errors[1];

  return { new_data: data, error, new_match: { players } };
}

export const CreateConnect4MatchForm: FC<{
  user: SelectUser;
  usernames: string[]; // usernames
  agent_slugs: string[]; // username/agentname
  create_connect4_match?: CreateConnect4MatchFormData;
}> = ({ user, usernames, agent_slugs, create_connect4_match }) => {
  if (!create_connect4_match) {
    create_connect4_match = {
      game: "connect4",
      "player_type[0]": "me",
      "player_name[0]": user.username,
      "player_type[1]": "me",
      "player_name[1]": user.username,
    };
  }

  const players = [
    {
      type: create_connect4_match["player_type[0]"],
      name: create_connect4_match["player_name[0]"],
    },
    {
      type: create_connect4_match["player_type[1]"],
      name: create_connect4_match["player_name[1]"],
    },
  ];

  const player_inputs = [];

  for (let i = 0; i < 2; i++) {
    switch (players[i].type) {
      case "me": {
        player_inputs.push(
          <input
            type="hidden"
            name={`player_name[${i}]`}
            value={user.username}
          />,
        );
        break;
      }
      case "agent": {
        if (!agent_slugs.includes(players[i].name)) {
          players[i].name = "";
        }
        player_inputs.push(
          <label className="label">
            <span class="label-text">Agent</span>
            <select
              className="select select-bordered w-full max-w-xs"
              name={`player_name[${i}]`}
              value={players[i].name}
            >
              <option disabled selected>
                Select An Option
              </option>
              {agent_slugs.map((agent_slug) => (
                <option
                  value={agent_slug}
                  selected={players[i].name === agent_slug}
                >
                  {agent_slug}
                </option>
              ))}
            </select>
          </label>,
        );
        break;
      }
    }
  }

  return (
    <form
      id="connect4_create_match_form"
      hx-post="/g/connect4/m/create_match"
      hx-target="this"
      hx-swap="outerHTML"
    >
      <input type="hidden" name="game" value="connect4" />

      <div class="container">
        <h2 class="text-4xl">Create Connect4 Match</h2>
        <div>
          <h3 class="text-3xl">Blue Player</h3>
          <div class="form-control">
            <span class="label-text">Type</span>
            <div class="join">
              <input
                class="join-item btn"
                type="radio"
                name="player_type[0]"
                value="me"
                aria-label="Me"
                checked={create_connect4_match["player_type[0]"] === "me"}
                hx-get="/g/connect4/m/create_match"
                hx-include="#connect4_create_match_form"
                hx-target="#connect4_create_match_form"
                hx-swap="outerHTML"
              />
              <input
                class="join-item btn"
                type="radio"
                name="player_type[0]"
                value="agent"
                aria-label="Agent"
                checked={create_connect4_match["player_type[0]"] === "agent"}
                hx-get="/g/connect4/m/create_match"
                hx-include="#connect4_create_match_form"
                hx-target="#connect4_create_match_form"
                hx-swap="outerHTML"
              />
            </div>
            {player_inputs[0]}
            {create_connect4_match["player_error[0]"] && (
              <div class="alert alert-error" role="alert">
                <span>{create_connect4_match["player_error[0]"]}</span>
              </div>
            )}
          </div>
        </div>
        <div>
          <h3 class="text-3xl">Red Player</h3>
          <div class="form-control">
            <span class="label-text">Type</span>
            <div class="join">
              <input
                class="join-item btn"
                type="radio"
                name="player_type[1]"
                value="me"
                aria-label="Me"
                checked={create_connect4_match["player_type[1]"] === "me"}
                hx-get="/g/connect4/m/create_match"
                hx-include="#connect4_create_match_form"
                hx-target="#connect4_create_match_form"
                hx-swap="outerHTML"
              />
              <input
                class="join-item btn"
                type="radio"
                name="player_type[1]"
                value="agent"
                aria-label="Agent"
                checked={create_connect4_match["player_type[1]"] === "agent"}
                hx-get="/g/connect4/m/create_match"
                hx-include="#connect4_create_match_form"
                hx-target="#connect4_create_match_form"
                hx-swap="outerHTML"
              />
            </div>
          </div>
          {player_inputs[1]}
          {create_connect4_match["player_error[1]"] && (
            <div class="alert alert-error" role="alert">
              <span>{create_connect4_match["player_error[1]"]}</span>
            </div>
          )}
        </div>
        <div>
          {create_connect4_match.form_error && (
            <div class="alert alert-error join-item" role="alert">
              <span>{create_connect4_match.form_error}</span>
            </div>
          )}
          <button class="btn btn-rounded-r-full" type="submit">
            Create Match
          </button>
        </div>
      </div>
    </form>
  );
};

export const Connect4Match: FC<{
  user: SelectUser | null;
  connect4_match: Connect4MatchView;
}> = ({ user, connect4_match }) => {
  let header;
  let player: Player | undefined;
  let player_i: number | undefined;

  const current_turn: Connect4CurrentTurn = connect4_match.current_turn;
  switch (current_turn.status.status) {
    case "in_progress": {
      player_i = current_turn.status.active_player;
      player = connect4_match.players[player_i];
      if (player !== undefined) {
        if (player_i === 0) {
          header = (
            <div>
              <h2 class="text-4xl">Blue's turn</h2>
              {player?.kind === "user" && player.username === user?.username
                ? <span class="text-2xl">That's you!</span>
                : (
                  <span class="text-2xl">
                    Waiting on {player.kind === "user"
                      ? `User: ${player.username}`
                      : `Agent: ${player.username}/${player.agentname}`}
                  </span>
                )}
            </div>
          );
        } else {
          header = (
            <div>
              <h2 class="text-4xl">Red's turn</h2>
              {player?.kind === "user" && player.username === user?.username
                ? <span class="text-2xl">That's you!</span>
                : (
                  <span class="text-2xl">
                    Waiting on {player.kind === "user"
                      ? `User: ${player.username}`
                      : `Agent: ${player.username}/${player.agentname}`}
                  </span>
                )}
            </div>
          );
        }
      }
      break;
    }
    case "over": {
      header = (
        <div>
          <h2 class="text-4xl">Game Over</h2>
          {current_turn.status.result.kind === "winner" &&
              current_turn.status.result.players[0] === 0
            ? <span class="text-2xl">Blue wins!</span>
            : current_turn.status.result.kind === "winner" &&
                current_turn.status.result.players[0] === 1
            ? <span class="text-2xl">Red wins!</span>
            : current_turn.status.result.kind === "draw"
            ? <span class="text-2xl">It's a draw!</span>
            : current_turn.status.result.kind === "errored"
            ? (
              <span class="text-2xl">
                Error: {current_turn.status.result.reason}
              </span>
            )
            : <span class="text-2xl">Error</span>}
        </div>
      );
      break;
    }
    default: {
      throw new Unreachable(current_turn.status);
    }
  }

  return (
    <div class="container flex flex-row flex-wrap">
      <div class="basis-1/2">
        {header}
        {/* Build the board with svg. code based on https://codepen.io/rossta/pen/eyrgJe */}
        <div class="grid place-content-center">
          <svg
            width="350px"
            viewBox="0 0 700 700"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <pattern
                id="cell-pattern"
                patternUnits="userSpaceOnUse"
                width="100"
                height="100"
              >
                <circle cx="50" cy="50" r="45" fill="black" />
              </pattern>
              <mask id="cell-mask">
                <rect width="100" height="600" fill="white" />
                <rect width="100" height="600" fill="url(#cell-pattern)" />
              </mask>
            </defs>
            {player?.kind === "user" && player.username === user?.username && (
              <svg x="0" y="0">
                {[...Array(7)].map((_, col) => {
                  const cx = col * 100 + 50;
                  const create_turn_url =
                    `/g/connect4/m/${connect4_match.match_id}/turns/create`;
                  const hx_vals = JSON.stringify({
                    game: "connect4",
                    column: col,
                  });
                  const color = player_i === 0
                    ? "text-blue-400"
                    : "text-red-400";
                  return (
                    <g>
                      <circle
                        class={`text-teal-800 hover:${color} fill-current`}
                        cx={cx}
                        cy="50"
                        r="45"
                        hx-post={create_turn_url}
                        hx-target="#match"
                        hx-vals={hx_vals}
                      />
                    </g>
                  );
                })}
              </svg>
            )}
            {[...Array(7)].map((_, col) => {
              const x = col * 100;
              return (
                <svg x={x} y="100">
                  {[...Array(6)].map((_, row) => {
                    const p = current_turn.state.board[col][row];
                    const row_elems = [];
                    if (p !== null) {
                      const cy = 550 - row * 100;
                      if (p === 0) {
                        row_elems.push(
                          <circle
                            cx="50"
                            cy={cy}
                            r="45"
                            class="text-blue-400 fill-current"
                          />,
                        );
                      } else {
                        row_elems.push(
                          <circle
                            cx="50"
                            cy={cy}
                            r="45"
                            class="text-red-400 fill-current"
                          />,
                        );
                      }
                    }
                    return (
                      <>
                        {row_elems}
                        <rect
                          width="100"
                          height="600"
                          class="text-teal-900 fill-current"
                          mask="url(#cell-mask)"
                        />
                      </>
                    );
                  })}
                </svg>
              );
            })}
          </svg>
        </div>
      </div>
      <div class="basis-1/2">
        <div>
          <h2 class="text-3xl">Turns</h2>
          <Table
            columns={["Turn", "Player", "Action"]}
            rows={connect4_match.turns.slice(1).map((turn) => {
              return [
                <span>{turn.turn_number}</span>,
                <span>
                  {turn.player_number == 0 ? "Blue" : "Red"}
                </span>,
                <span>{turn.action?.column}</span>,
              ];
            })}
          />
        </div>
      </div>
    </div>
  );
};

export const CreatePokerMatchFormData = z.object({
  game: z.literal("poker"),
  "player_type[0]": z.union([z.literal("me"), z.literal("agent")]),
  "player_name[0]": z.string(),
  "player_type[1]": z.union([z.literal("me"), z.literal("agent")]),
  "player_name[1]": z.string(),
  "player_error[0]": z.string().optional(),
  "player_error[1]": z.string().optional(),
  form_error: z.string().optional(),
});
export type CreatePokerMatchFormData = z.infer<
  typeof CreatePokerMatchFormData
>;

// Todo: can probably do validation outside of the component now.
export function validateCreatePokerMatchForm(
  user: SelectUser,
  usernames: string[], // usernames
  agent_slugs: string[], // username/agentname
  data: CreatePokerMatchFormData,
): {
  new_data: CreatePokerMatchFormData;
  error: boolean;
  new_match?: {
    players: Player[];
  };
} {
  const player_inputs = [
    {
      player_type: data["player_type[0]"],
      player_name: data["player_name[0]"],
    },
    {
      player_type: data["player_type[1]"],
      player_name: data["player_name[1]"],
    },
  ];

  let error = false;
  const players: Player[] = [];
  const player_errors: string[] = ["", ""];

  for (let i = 0; i < 2; i++) {
    const player_type = player_inputs[i].player_type;
    const player_name = player_inputs[i].player_name;
    switch (player_type) {
      case "me": {
        // name must be the user's name.
        const parsed_username = Name.safeParse(player_name);
        if (!parsed_username.success) {
          error = true;
          player_errors[i] = "Invalid username.";
          break;
        }
        const username = parsed_username.data;
        if (username !== user.username) {
          error = true;
          player_errors[i] = "Invalid username.";
          break;
        }

        players.push({
          kind: "user",
          username,
        });
        break;
      }
      case "agent": {
        if (!agent_slugs.includes(player_name)) {
          error = true;
          player_errors[i] = "Invalid agent name.";
          break;
        }

        const split = player_name.split("/");
        if (split.length !== 2) {
          error = true;
          player_errors[i] = "Invalid agent name.";
          break;
        }

        const [username_s, agentname_s] = split;
        const parsed_username = Name.safeParse(username_s);
        if (!parsed_username.success) {
          error = true;
          player_errors[i] = "Invalid agent name.";
          break;
        }
        const username = parsed_username.data;

        const parsed_agentname = Name.safeParse(agentname_s);
        if (!parsed_agentname.success) {
          error = true;
          player_errors[i] = "Invalid agent name.";
          break;
        }
        const agentname = parsed_agentname.data;

        players.push({
          kind: "agent",
          username,
          agentname,
        });
        break;
      }
      default: {
        throw new Unreachable(player_type);
      }
    }
  }

  data["player_error[0]"] = player_errors[0];
  data["player_error[1]"] = player_errors[1];

  return { new_data: data, error, new_match: { players } };
}

export const CreatePokerMatchForm: FC<{
  user: SelectUser;
  usernames: string[]; // usernames
  agent_slugs: string[]; // username/agentname
  create_poker_match?: CreatePokerMatchFormData;
}> = ({ user, usernames, agent_slugs, create_poker_match }) => {
  if (!create_poker_match) {
    create_poker_match = {
      game: "poker",
      "player_type[0]": "me",
      "player_name[0]": user.username,
      "player_type[1]": "me",
      "player_name[1]": user.username,
    };
  }

  const players = [
    {
      type: create_poker_match["player_type[0]"],
      name: create_poker_match["player_name[0]"],
    },
    {
      type: create_poker_match["player_type[1]"],
      name: create_poker_match["player_name[1]"],
    },
  ];

  const player_inputs = [];

  for (let i = 0; i < 2; i++) {
    switch (players[i].type) {
      case "me": {
        player_inputs.push(
          <input
            type="hidden"
            name={`player_name[${i}]`}
            value={user.username}
          />,
        );
        break;
      }
      case "agent": {
        if (!agent_slugs.includes(players[i].name)) {
          players[i].name = "";
        }
        player_inputs.push(
          <label className="label">
            <span class="label-text">Agent</span>
            <select
              className="select select-bordered w-full max-w-xs"
              name={`player_name[${i}]`}
              value={players[i].name}
            >
              <option disabled selected>
                Select An Option
              </option>
              {agent_slugs.map((agent_slug) => (
                <option
                  value={agent_slug}
                  selected={players[i].name === agent_slug}
                >
                  {agent_slug}
                </option>
              ))}
            </select>
          </label>,
        );
        break;
      }
    }
  }

  return (
    <form
      id="poker_create_match_form"
      hx-post="/g/poker/m/create_match"
      hx-target="this"
      hx-swap="outerHTML"
    >
      <input type="hidden" name="game" value="poker" />

      <div class="container">
        <h2 class="text-4xl">Create Poker Match</h2>
        <div>
          <h3 class="text-3xl">Player 1</h3>
          <div class="form-control">
            <span class="label-text">Type</span>
            <div class="join">
              <input
                class="join-item btn"
                type="radio"
                name="player_type[0]"
                value="me"
                aria-label="Me"
                checked={create_poker_match["player_type[0]"] === "me"}
                hx-get="/g/poker/m/create_match"
                hx-include="#poker_create_match_form"
                hx-target="#poker_create_match_form"
                hx-swap="outerHTML"
              />
              <input
                class="join-item btn"
                type="radio"
                name="player_type[0]"
                value="agent"
                aria-label="Agent"
                checked={create_poker_match["player_type[0]"] === "agent"}
                hx-get="/g/poker/m/create_match"
                hx-include="#poker_create_match_form"
                hx-target="#poker_create_match_form"
                hx-swap="outerHTML"
              />
            </div>
            {player_inputs[0]}
            {create_poker_match["player_error[0]"] && (
              <div class="alert alert-error" role="alert">
                <span>{create_poker_match["player_error[0]"]}</span>
              </div>
            )}
          </div>
        </div>
        <div>
          <h3 class="text-3xl">Player 2</h3>
          <div class="form-control">
            <span class="label-text">Type</span>
            <div class="join">
              <input
                class="join-item btn"
                type="radio"
                name="player_type[1]"
                value="me"
                aria-label="Me"
                checked={create_poker_match["player_type[1]"] === "me"}
                hx-get="/g/poker/m/create_match"
                hx-include="#poker_create_match_form"
                hx-target="#poker_create_match_form"
                hx-swap="outerHTML"
              />
              <input
                class="join-item btn"
                type="radio"
                name="player_type[1]"
                value="agent"
                aria-label="Agent"
                checked={create_poker_match["player_type[1]"] === "agent"}
                hx-get="/g/poker/m/create_match"
                hx-include="#poker_create_match_form"
                hx-target="#poker_create_match_form"
                hx-swap="outerHTML"
              />
            </div>
          </div>
          {player_inputs[1]}
          {create_poker_match["player_error[1]"] && (
            <div class="alert alert-error" role="alert">
              <span>{create_poker_match["player_error[1]"]}</span>
            </div>
          )}
        </div>
        <div>
          {create_poker_match.form_error && (
            <div class="alert alert-error join-item" role="alert">
              <span>{create_poker_match.form_error}</span>
            </div>
          )}
          <button class="btn btn-rounded-r-full" type="submit">
            Create Match
          </button>
        </div>
      </div>
    </form>
  );
};

export const PokerMatch: FC<{
  user: SelectUser | null;
  poker_match: PokerMatchView;
}> = ({ user, poker_match }) => {
  let header;
  let player: Player | undefined;
  let player_i: number | undefined;

  const players = poker_match.players;
  const state = poker_match.current_turn.state;
  const round = state.rounds[state.round];
  const current_player = poker_match.players[round.current_player];

  return (
    <div class="container flex flex-wrap">
      <div>
        <h2 class="text-4xl">Poker</h2>

        {poker_match.current_turn.status.status === "over"
          ? (
            <div>
              <h2 class="text-xl">Game Over</h2>
              {poker_match.current_turn.status.result.kind === "winner"
                ? (
                  <h4 class="text-l">
                    Player {poker_match.current_turn.status.result.players[0]}
                    {" "}
                    Wins
                  </h4>
                )
                : poker_match.current_turn.status.result.kind === "draw"
                ? <h4 class="text-l">Draw</h4>
                : (
                  <h4 class="text-l">
                    Error: {poker_match.current_turn.status.result.reason}
                  </h4>
                )}
            </div>
          )
          : (
            <div>
              <div class="grid grid-cols-2">
                <span class="text-xl">
                  Round {state.round}:{" "}
                  {round.stage[0].toUpperCase() + round.stage.slice(1)}
                </span>
                <span class="text-xl">
                  Pot: {round.pot}
                </span>
              </div>
              {current_player !== undefined && (
                <h4 class="text-l">
                  {current_player.kind === "agent"
                    ? current_player.username + "/" + current_player.agentname
                    : current_player.username}'s turn
                </h4>
              )}
            </div>
          )}
        <span>Table Cards</span>
        <div class="grid grid-cols-5">
          {round.table_cards.map((card) => <span>{cardToString(card)}</span>)}
        </div>
        <span>Players</span>
        <div
          class={`grid grid-cols-${players.length}`}
        >
          {players.map((player, i) => {
            return (
              <div class="flex flex-col">
                <div class="grid grid-cols-2">
                  <span>
                    {player.kind === "agent"
                      ? player.username +
                        player.agentname
                      : player.username}
                    {round.dealer === i ? "[dealer] " : ""}
                  </span>
                  <span>bet: {round.player_bets[i]}</span>
                </div>
                <div class="grid grid-cols-2">
                  <span>{cardToString(round.player_cards[i][0])}</span>
                  <span>{cardToString(round.player_cards[i][1])}</span>
                </div>
                <span>chips: {state.player_chips[i]}</span>
                <span>status: {round.player_status[i]}</span>
                {i === round.current_player && (
                  <div>
                    <button
                      class="btn"
                      hx-post={`/g/poker/m/${poker_match.match_id}/turns/create`}
                      hx-target="#match"
                      hx-vals={JSON.stringify({ action: "fold" })}
                    >
                      Fold
                    </button>
                    {round.bet === round.player_bets[i] && (
                      <button
                        class="btn"
                        hx-post={`/g/poker/m/${poker_match.match_id}/turns/create`}
                        hx-target="#match"
                        hx-vals={JSON.stringify({ action: "check" })}
                      >
                        Check
                      </button>
                    )}
                    {round.bet > round.player_bets[i] && (
                      <button
                        class="btn"
                        hx-post={`/g/poker/m/${poker_match.match_id}/turns/create`}
                        hx-target="#match"
                        hx-vals={JSON.stringify({
                          action: "call",
                          amount: Math.min(
                            round.bet - round.player_bets[i],
                            state.player_chips[i],
                          ),
                        })}
                      >
                        {round.bet - round.player_bets[i] >
                            state.player_chips[i]
                          ? "All in"
                          : "Call"}
                      </button>
                    )}
                    {round.bet > 0 &&
                      (round.bet - round.player_bets[i]) <
                        state.player_chips[i] &&
                      (
                        <form
                          hx-post={`/g/poker/m/${poker_match.match_id}/turns/create`}
                          hx-target="#match"
                          hx-vals={JSON.stringify({ action: "raise" })}
                        >
                          <input
                            class="input"
                            type="number"
                            name="amount"
                            value={1}
                            min={1}
                            max={state.player_chips[i] -
                              (round.bet - round.player_bets[i])}
                          />
                          <button class="btn" type="submit">
                            Raise
                          </button>
                        </form>
                      )}
                    {round.bet === 0 && (
                      <form
                        hx-post={`/g/poker/m/${poker_match.match_id}/turns/create`}
                        hx-target="#match"
                        hx-vals={JSON.stringify({ action: "bet" })}
                      >
                        <input
                          class="input"
                          type="number"
                          name="amount"
                          value={1}
                          min={1}
                          max={state.player_chips[i]}
                        />
                        <button class="btn" type="submit">
                          Bet
                        </button>
                      </form>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div>
        <div>
          <h2 class="text-3xl">Turns</h2>
          <Table
            columns={["Turn", "Player", "Action"]}
            rows={poker_match.turns.slice(1).map((turn) => {
              return [
                <span>{turn.turn_number}</span>,
                <span>
                  {turn.player_number !== null ? turn.player_number + 1 : ""}
                </span>,
                <span>{JSON.stringify(turn.action)}</span>,
              ];
            })}
          />
        </div>
      </div>
    </div>
  );
};

export function sleep(milliseconds = 3000) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export type ContextVars = {
  // Set by the wrapping app.
  db: GamePlayDB;
  kv: Deno.Kv;
  clerk_publishable_key: string;
  clerk_frontend_api: string;
  clerk_jwt_key: string;

  // Set by middleware.
  user?: SelectUser;
};

export type GamePlayContext = Context<{ Variables: ContextVars }>;

const LoggedInNav: FC = () => {
  return (
    <header>
      <div class="navbar bg-base-100" hx-boost="true" hx-target="#main">
        <div class="flex-1">
          <a class="btn btn-ghost text-xl" href="/">
            Gameplay
          </a>
        </div>
        <div class="flex-none">
          <ul class="menu menu-horizontal px-1">
            <li>
              <a class="btn btn-ghost" href="/g">
                Games
              </a>
            </li>
            <li>
              <a class="btn btn-ghost" href="/g/connect4/m">
                Matches
              </a>
            </li>
            <li>
              <a class="btn btn-ghost" href="/g/connect4/a">
                Agents
              </a>
            </li>
            <li>
              <div id="clerk-user"></div>
            </li>
          </ul>
        </div>
      </div>
    </header>
  );
};

const LoggedOutNav: FC = () => {
  return (
    <header>
      <div class="navbar bg-base-100" hx-boost="true" hx-target="#main">
        <div class="flex-1">
          <a class="btn btn-ghost text-xl" href="/">
            Gameplay
          </a>
        </div>
        <div class="flex-none">
          <ul class="menu menu-horizontal px-1">
            <li>
              <a
                class="btn btn-primary"
                role="button"
                href="#"
                onclick="window.Clerk.openSignUp({redirectUrl: '/'})"
              >
                Sign Up
              </a>
            </li>
            <li>
              <a
                class="btn"
                role="button"
                href="#"
                onclick="window.Clerk.openSignIn({redirectUrl: '/'})"
              >
                Log In
              </a>
            </li>
            <li>
              <div id="clerk-user"></div>
            </li>
          </ul>
        </div>
      </div>
    </header>
  );
};

const Main: FC<{ children: Child }> = ({ children }) => {
  return (
    <main id="main" class="flex-grow container mx-auto">
      {children}
    </main>
  );
};

const Page: FC<{ children: Child }> = ({ children }) => {
  const c: GamePlayContext = useRequestContext();
  const clerk_publishable_key = c.get("clerk_publishable_key");
  const clerk_frontend_api = c.get("clerk_frontend_api");

  const server_signed_in = c.get("user") !== undefined;
  return (
    <html data-theme="lemonade">
      <head>
        <meta charset="utf-8"></meta>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0"
        >
        </meta>
        <title>Gameplay</title>
        <link
          href="https://unpkg.com/@tailwindcss/typography@0.5.0/dist/typography.min.css"
          rel="stylesheet"
          type="text/css"
        >
        </link>
        <link
          href="https://cdn.jsdelivr.net/npm/daisyui@4.7.3/dist/full.min.css"
          rel="stylesheet"
          type="text/css"
        />
        <script src="https://cdn.tailwindcss.com"></script>
        <script src="https://unpkg.com/htmx.org@1.9.11"></script>
        <script src="https://unpkg.com/htmx.org@1.9.11/dist/ext/sse.js">
        </script>
        <script>
          var server_signed_in = {JSON.stringify(server_signed_in)};
        </script>
        {html`
        <script>
          async function loadClerk() {
            await window.Clerk.load();
            if (window.Clerk.user) {
              if (!server_signed_in) {
                window.location.reload();
              }
              const user_div = document.getElementById("clerk-user");
              user_div.innerHTML = "";
              window.Clerk.mountUserButton(user_div);
            } else {
              if (server_signed_in) {
                window.location.reload();
              }
            }
          }
        </script>
      `}
        <script
          async
          crossorigin="anonymous"
          data-clerk-publishable-key={clerk_publishable_key}
          src={clerk_frontend_api +
            "/npm/@clerk/clerk-js@4/dist/clerk.browser.js"}
          type="text/javascript"
          onload="loadClerk()"
        >
        </script>
      </head>
      <body class="h-screen flex flex-col">
        {server_signed_in
          ? <LoggedInNav></LoggedInNav>
          : <LoggedOutNav></LoggedOutNav>}
        <Main children={children}></Main>
      </body>
    </html>
  );
};

const Layout: FC<{ children: Child }> = ({ children }) => {
  const c = useRequestContext();
  const hx_target = c.req.header("hx-target");
  switch (hx_target) {
    case undefined: {
      const page = <Page children={children}></Page>;
      return html`<!DOCTYPE html>${page}`;
    }
    case "main": {
      return <Main children={children}></Main>;
    }
    default: {
      return <>{children}</>;
    }
  }
};

const BreadCrumbs: FC<{
  links: { href: string; text: string }[];
}> = ({ links }) => {
  return (
    <div class="tx-sm breadcrumbs" hx-boost="true" hx-target="#main">
      <ul>
        {links.map((link) => (
          <li>
            <a href={link.href}>{link.text}</a>
          </li>
        ))}
      </ul>
    </div>
  );
};

const Table: FC<{ columns: string[]; rows: JSX.Element[][] }> = ({
  columns,
  rows,
}) => {
  return (
    <table className="table table-xs">
      <thead>
        <tr>
          {columns.map((column) => <th>{column}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr>
            {row.map((cell) => <td>{cell}</td>)}
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          {columns.map((column) => <th>{column}</th>)}
        </tr>
      </tfoot>
    </table>
  );
};

export const app = new Hono();

app.use("*", async (c: GamePlayContext, next) => {
  const session_cookie = getCookie(c, "__session");
  if (session_cookie) {
    const clerk_jwt_key = c.get("clerk_jwt_key")!.replaceAll("|", "\n");
    const jwt_key = await importSPKI(clerk_jwt_key, "RS256");
    try {
      const decoded = await jwtVerify(session_cookie, jwt_key);
      const clerk_user = ClerkUser.parse(decoded.payload);
      const user = await syncClerkUser(c.get("db"), clerk_user);
      c.set("user", user);
    } catch (_e) {
      // console.error("Failed to verify JWT", e);
    }
  }
  await next();
});

app.use(
  "*",
  jsxRenderer(({ children }) => <Layout children={children!}></Layout>, {
    docType: false,
  }),
);

app.get("/", (c: GamePlayContext) => {
  const user = c.get("user");
  if (user) {
    return c.render(
      <div hx-boost="true" hx-target="#main">
        <p>Hello, {user.username}</p>
        <p>
          <a class="link" href="/g">
            Games
          </a>
        </p>
      </div>,
    );
  } else {
    return c.render(
      <div>
        <span>Log in to get started.</span>
      </div>,
    );
  }
});

app.get("/g", (c: GamePlayContext) => {
  return c.render(
    <div>
      <BreadCrumbs links={[{ href: "/g", text: "Games" }]}></BreadCrumbs>
      <div hx-boost="true" hx-target="#main">
        <ul>
          {GameKind.options.map((game) => (
            <li>
              <a class="link text-4xl" href={`/g/${game}`}>
                {game.charAt(0).toUpperCase() + game.slice(1)}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>,
  );
});

app.get("/g/:game", async (c: GamePlayContext) => {
  const parsed_game = GameKind.safeParse(c.req.param("game"));
  if (!parsed_game.success) {
    return c.notFound();
  }
  const game = parsed_game.data;
  const user = c.get("user");
  if (!user) {
    return c.redirect("/");
  }

  const matches = await findMatchesForGameAndUser(
    c.get("db"),
    game,
    user.user_id,
  );

  const agents = await findAgentsForGameAndUser(
    c.get("db"),
    game,
    user,
  );

  return c.render(
    <div class="flex flex-col h-full">
      <BreadCrumbs
        links={[
          { href: "/g", text: "Games" },
          {
            href: `/g/${game}`,
            text: game.charAt(0).toUpperCase() + game.slice(1),
          },
        ]}
      >
      </BreadCrumbs>
      <div class="grow">
        <div class="flex">
          <div class="container" hx-boost="true" hx-target="#main">
            <a class="link" href={`/g/${game}/m`}>
              <h2 class="text-4xl">Matches</h2>
            </a>
            <Table
              columns={["Id", "Status", "Your Turn"]}
              rows={matches.map((match) => {
                return [
                  <a class="link" href={`/g/${game}/m/${match.match_id}`}>
                    {match.match_id}
                  </a>,
                  <span>{match.status.status}</span>,
                  <span>{match.active_player.toString()}</span>,
                ];
              })}
            >
            </Table>
          </div>
          <div class="container" hx-boost="true" hx-target="#main">
            <a class="link" href={`/g/${game}/a`}>
              <h2 class="text-4xl">Agents</h2>
            </a>
            <Table
              columns={["Id", "Status"]}
              rows={agents.map((agent) => {
                return [
                  <a class="link" href={`/g/${game}/a/${agent.agent_slug}`}>
                    {agent.agent_slug}
                  </a>,
                  <span>{agent.status_kind}</span>,
                ];
              })}
            />
          </div>
        </div>
      </div>
    </div>,
  );
});

app.get("/g/:game/m", async (c: GamePlayContext) => {
  const parsed_game = GameKind.safeParse(c.req.param("game"));
  if (!parsed_game.success) {
    return c.notFound();
  }
  const game = parsed_game.data;
  const user = c.get("user");
  if (!user) {
    return c.redirect("/");
  }

  const matches = await findMatchesForGameAndUser(
    c.get("db"),
    game,
    user.user_id,
  );

  const usernames: Name[] = [];
  const agent_slugs = await findAgentsForGame(c.get("db"), game);

  let form;
  switch (game) {
    case "connect4": {
      form = (
        <CreateConnect4MatchForm
          user={user}
          usernames={usernames}
          agent_slugs={agent_slugs}
        />
      );
      break;
    }
    case "poker": {
      form = (
        <CreatePokerMatchForm
          user={user}
          usernames={usernames}
          agent_slugs={agent_slugs}
        />
      );
      break;
    }
    default: {
      throw new Unreachable(game);
    }
  }

  return c.render(
    <div class="flex flex-col h-full">
      <BreadCrumbs
        links={[
          { href: "/g", text: "Games" },
          {
            href: `/g/${game}`,
            text: game.charAt(0).toUpperCase() + game.slice(1),
          },
          { href: `/g/${game}/m`, text: "Matches" },
        ]}
      >
      </BreadCrumbs>
      <div class="grow">
        <div class="flex">
          <div class="container">{form}</div>
          <div class="container" hx-boost="true" hx-target="#main">
            <Table
              columns={["Id", "Status", "Your Turn"]}
              rows={matches.map((match) => {
                return [
                  <a class="link" href={`/g/${game}/m/${match.match_id}`}>
                    {match.match_id}
                  </a>,
                  <span>{match.status.status}</span>,
                  <span>{match.active_player.toString()}</span>,
                ];
              })}
            >
            </Table>
          </div>
        </div>
      </div>
    </div>,
  );
});

app.get("/g/:game/m/create_match", async (c: GamePlayContext) => {
  const parsed_game = GameKind.safeParse(c.req.param("game"));
  if (!parsed_game.success) {
    return c.notFound();
  }
  const game = parsed_game.data;
  const user = c.get("user");
  if (!user) {
    return c.redirect("/");
  }

  const current_data = c.req.query();

  switch (game) {
    case "connect4": {
      const parsed_form = CreateConnect4MatchFormData.safeParse(current_data);
      let form: CreateConnect4MatchFormData | undefined;
      if (parsed_form.success) {
        form = parsed_form.data;
      }

      const usernames: Name[] = [];
      const agent_slugs = await findAgentsForGame(c.get("db"), game);

      return c.render(
        <CreateConnect4MatchForm
          user={user}
          usernames={usernames}
          agent_slugs={agent_slugs}
          create_connect4_match={form}
        />,
      );
    }
    case "poker": {
      const parsed_form = CreatePokerMatchFormData.safeParse(current_data);
      let form: CreatePokerMatchFormData | undefined;
      if (parsed_form.success) {
        form = parsed_form.data;
      }

      const usernames: Name[] = [];
      const agent_slugs = await findAgentsForGame(c.get("db"), game);

      return c.render(
        <CreatePokerMatchForm
          user={user}
          usernames={usernames}
          agent_slugs={agent_slugs}
          create_poker_match={form}
        />,
      );
    }
    default: {
      throw new Unreachable(game);
    }
  }
});

app.post("/g/:game/m/create_match", async (c: GamePlayContext) => {
  const parsed_game = GameKind.safeParse(c.req.param("game"));
  if (!parsed_game.success) {
    return c.notFound();
  }
  const game = parsed_game.data;
  const user = c.get("user");
  if (!user) {
    return c.redirect("/");
  }

  const current_data = await c.req.parseBody();

  let match_id;
  let first_player_agent = false;
  switch (game) {
    case "connect4": {
      const usernames: Name[] = [];
      const agent_slugs = await findAgentsForGame(c.get("db"), game);

      const parsed_form = CreateConnect4MatchFormData.safeParse(current_data);
      if (!parsed_form.success) {
        return c.render(
          <CreateConnect4MatchForm
            user={user}
            usernames={usernames}
            agent_slugs={agent_slugs}
          />,
        );
      }
      const form = parsed_form.data;

      const {
        new_data,
        error,
        new_match: new_match_spec,
      } = validateCreateConnect4MatchForm(
        user,
        usernames,
        agent_slugs,
        form,
      );
      if (error) {
        return c.render(
          <CreateConnect4MatchForm
            user={user}
            usernames={usernames}
            agent_slugs={agent_slugs}
            create_connect4_match={new_data}
          />,
        );
      }

      const { players } = new_match_spec!;
      const new_match = await createMatch(
        c.get("db"),
        c.get("kv"),
        user,
        players,
        "connect4",
      );
      if (new_match instanceof Error) {
        new_data.form_error = new_match.message;

        return c.render(
          <CreateConnect4MatchForm
            user={user}
            usernames={usernames}
            agent_slugs={agent_slugs}
            create_connect4_match={new_data}
          />,
        );
      }

      match_id = new_match.match_id;
      first_player_agent = new_match.first_player_agent;
      break;
    }
    case "poker": {
      const usernames: Name[] = [];
      const agent_slugs = await findAgentsForGame(c.get("db"), game);

      const parsed_form = CreatePokerMatchFormData.safeParse(current_data);
      if (!parsed_form.success) {
        return c.render(
          <CreatePokerMatchForm
            user={user}
            usernames={usernames}
            agent_slugs={agent_slugs}
          />,
        );
      }
      const form = parsed_form.data;

      const {
        new_data,
        error,
        new_match: new_match_spec,
      } = validateCreatePokerMatchForm(
        user,
        usernames,
        agent_slugs,
        form,
      );
      if (error) {
        return c.render(
          <CreatePokerMatchForm
            user={user}
            usernames={usernames}
            agent_slugs={agent_slugs}
            create_poker_match={new_data}
          />,
        );
      }

      const { players } = new_match_spec!;
      const new_match = await createMatch(
        c.get("db"),
        c.get("kv"),
        user,
        players,
        "poker",
      );
      if (new_match instanceof Error) {
        new_data.form_error = new_match.message;

        return c.render(
          <CreatePokerMatchForm
            user={user}
            usernames={usernames}
            agent_slugs={agent_slugs}
            create_poker_match={new_data}
          />,
        );
      }

      match_id = new_match.match_id;
      first_player_agent = new_match.first_player_agent;
      break;
    }
    default: {
      throw new Unreachable(game);
    }
  }

  if (first_player_agent) {
    await queueTask(c.get("kv"), {
      kind: "agent_turn",
      match_id,
    });
  }

  const url = `/g/${game}/m/${match_id}`;
  const redirect = {
    path: url,
    target: "#main",
  };
  c.res.headers.set("HX-Location", JSON.stringify(redirect));
  return c.render(
    <div>
      <span>Created Match, redirecting to {url}</span>
    </div>,
  );
});

const Match: FC<{
  user: SelectUser;
  match_view: MatchView;
  children: Child;
}> = ({ user, match_view, children }): JSX.Element => {
  const game = match_view.game;
  const match_id = match_view.match_id;
  const current_turn = match_view.current_turn;

  // Poll for updates if the game is in_progress and the
  // player is not active.
  if (current_turn.status.status === "in_progress") {
    const player_indexes = new Set();
    for (let i = 0; i < match_view.players.length; i++) {
      const player = match_view.players[i];
      if (player.kind === "user" && player.username === user.username) {
        player_indexes.add(i);
      }
    }

    if (!player_indexes.has(current_turn.status.active_player)) {
      return (
        <div
          hx-ext="sse"
          sse-connect={`/g/${game}/m/${match_id}/changes?turn=${current_turn.turn_number}`}
        >
          <div
            class="container"
            hx-get={`/g/${game}/m/${match_id}`}
            hx-trigger="sse:message"
            hx-target="#match"
          >
            {children}
          </div>
        </div>
      );
    }
  }
  return (
    <div>
      <div class="container">{children}</div>
    </div>
  );
};

app.get("/g/:game/m/:match_id/changes", (c: GamePlayContext) => {
  const parsed_game = GameKind.safeParse(c.req.param("game"));
  if (!parsed_game.success) {
    return c.notFound();
  }
  const game = parsed_game.data;

  const parsed_match_id = MatchId.safeParse(c.req.param("match_id"));
  if (!parsed_match_id.success) {
    return c.notFound();
  }
  const match_id = parsed_match_id.data;

  const parsed_turn = z.coerce.number().safeParse(c.req.query("turn"));
  if (!parsed_turn.success) {
    return c.notFound();
  }
  const turn = parsed_turn.data;

  const user = c.get("user");
  if (!user) {
    return c.redirect("/");
  }

  return streamSSE(c, async (stream) => {
    const changes = c.get("kv").watch<number[]>([["match_turn", match_id]]);
    for await (const [change] of changes) {
      if (change.value !== null && change.versionstamp !== null) {
        const new_turn = change.value;
        if (new_turn > turn) {
          await stream.writeSSE({
            data: new_turn.toString(),
          });
        }
      }
    }
  });
});

app.get("/g/:game/m/:match_id", async (c: GamePlayContext) => {
  const parsed_game = GameKind.safeParse(c.req.param("game"));
  if (!parsed_game.success) {
    return c.notFound();
  }
  const game = parsed_game.data;

  const parsed_match_id = MatchId.safeParse(c.req.param("match_id"));
  if (!parsed_match_id.success) {
    return c.notFound();
  }
  const match_id = parsed_match_id.data;

  const user = c.get("user");
  if (!user) {
    return c.redirect("/");
  }

  const match_view = await fetchMatchById(c.get("db"), match_id);
  if (match_view instanceof Error) {
    return c.notFound();
  }

  let inner_view;

  switch (match_view.game) {
    case "connect4": {
      inner_view = <Connect4Match user={user} connect4_match={match_view} />;
      break;
    }
    case "poker": {
      inner_view = <PokerMatch user={user} poker_match={match_view} />;
      break;
    }
    default: {
      throw new Unreachable(match_view);
    }
  }

  if (c.req.header("hx-target") === "match") {
    return c.render(
      <Match user={user} match_view={match_view}>
        {inner_view}
      </Match>,
    );
  }

  return c.render(
    <div>
      <BreadCrumbs
        links={[
          { href: "/g", text: "Games" },
          {
            href: `/g/${game}`,
            text: game.charAt(0).toUpperCase() + game.slice(1),
          },
          { href: `/g/${game}/m`, text: "Matches" },
          { href: `/g/${game}/m/${match_id}`, text: match_id },
        ]}
      >
      </BreadCrumbs>
      <div id="match">
        <Match user={user} match_view={match_view}>
          {inner_view}
        </Match>
      </div>
    </div>,
  );
});

app.post("/g/:game/m/:match_id/turns/create", async (c: GamePlayContext) => {
  const parsed_game = GameKind.safeParse(c.req.param("game"));
  if (!parsed_game.success) {
    return c.notFound();
  }
  const game = parsed_game.data;
  const user = c.get("user");

  const parsed_match_id = MatchId.safeParse(c.req.param("match_id"));
  if (!parsed_match_id.success) {
    return c.notFound();
  }
  const match_id = parsed_match_id.data;

  if (!user) {
    return c.redirect("/");
  }

  const data = await c.req.parseBody();

  switch (game) {
    case "connect4": {
      const parsed_action = Connect4Action.safeParse(data);
      if (!parsed_action.success) {
        return c.json(
          { ok: false, error: parsed_action.error },
          { status: 400 },
        );
      }
      const action = parsed_action.data;
      const result = await takeMatchUserTurn(
        c.get("db"),
        c.get("kv"),
        user,
        match_id,
        {
          game,
          action,
        },
      );
      if (result instanceof Error) {
        return c.json({ ok: false, error: result }, { status: 400 });
      }
      break;
    }
    case "poker": {
      const parsed_action = PokerAction.safeParse(data);
      if (!parsed_action.success) {
        return c.json(
          { ok: false, error: parsed_action.error },
          { status: 400 },
        );
      }
      const action = parsed_action.data;
      const result = await takeMatchUserTurn(
        c.get("db"),
        c.get("kv"),
        user,
        match_id,
        {
          game,
          action,
        },
      );
      if (result instanceof Error) {
        return c.json({ ok: false, error: result }, { status: 400 });
      }
      break;
    }
    default: {
      throw new Unreachable(game);
    }
  }

  const match_view = await fetchMatchById(c.get("db"), match_id);
  if (match_view instanceof Error) {
    return c.notFound();
  }

  let inner_view;

  switch (match_view.game) {
    case "connect4": {
      inner_view = <Connect4Match user={user} connect4_match={match_view} />;
      break;
    }
    case "poker": {
      inner_view = <PokerMatch user={user} poker_match={match_view} />;
      break;
    }
    default: {
      throw new Unreachable(match_view);
    }
  }

  // queue task if an agent is next
  if (
    match_view.current_turn.status.status === "in_progress" &&
    match_view.players[match_view.current_turn.status.active_player]
        .kind === "agent"
  ) {
    await queueTask(c.get("kv"), { kind: "agent_turn", match_id });
  }

  return c.render(
    <Match user={user} match_view={match_view}>
      {inner_view}
    </Match>,
  );
});

type CreateAgentFormDetails = {
  values: {
    agentname: string;
    url: string;
  };
  errors: {
    agentname: string[];
    url: string[];
    form: string[];
  };
};

export const CreateAgentForm: FC<{
  user: SelectUser;
  game: GameKind;
  details: CreateAgentFormDetails;
}> = ({ user, game, details }) => {
  return (
    <form
      id="create_agent_form"
      hx-post={`/g/${game}/a/create_agent`}
      hx-target="this"
      hx-swap="outerHTML"
    >
      <input type="hidden" name="game" value={game} />
      <div class="container">
        <h2 class="text-4xl">
          Create {game.charAt(0).toUpperCase() + game.slice(1)} Agent
        </h2>
        <div class="form-control">
          <label class="label">
            <span class="label-text">Name</span>
            <input
              class="input input-bordered w-full max-w-xs"
              placeholder="my_agent"
              name="agentname"
              value={details.values.agentname}
            />
          </label>
          {details.errors.agentname.map((error) => (
            <div class="alert alert-error" role="alert">
              <span>{error}</span>
            </div>
          ))}
          <label class="label">
            <span class="label-text">Url</span>
            <input
              type="url"
              class="input input-bordered w-full max-w-xs"
              placeholder={`https://${user.username}-my_agent.web.val.run`}
              name="url"
              value={details.values.url}
            />
          </label>
          {details.errors.url.map((error) => (
            <div class="alert alert-error" role="alert">
              <span>{error}</span>
            </div>
          ))}
        </div>
        <div>
          {details.errors.form.map((error) => (
            <div class="alert alert-error" role="alert">
              <span>{error}</span>
            </div>
          ))}
          <button class="btn btn-rounded-r-full" type="submit">
            Create Agent
          </button>
        </div>
      </div>
    </form>
  );
};

export const CreateAgentFormData = z.object({
  game: GameKind,
  agentname: Name,
  url: Url,
});
export type CreateAgentFormData = z.infer<typeof CreateAgentFormData>;

app.post("/g/:game/a/create_agent", async (c: GamePlayContext) => {
  const parsed_game = GameKind.safeParse(c.req.param("game"));
  if (!parsed_game.success) {
    return c.notFound();
  }
  const game = parsed_game.data;
  const user = c.get("user");
  if (!user) {
    return c.redirect("/");
  }

  const body = await c.req.parseBody();
  const parsed_form = CreateAgentFormData.safeParse(body);
  if (!parsed_form.success) {
    const errors = parsed_form.error.format();
    const details = {
      values: {
        agentname: body.agentname?.toString() || "",
        url: body.url?.toString() || "",
      },
      errors: {
        agentname: errors.agentname?._errors || [],
        url: errors.url?._errors || [],
        form: [],
      },
    };

    return c.render(
      <CreateAgentForm
        user={user}
        game={game}
        details={details}
      >
      </CreateAgentForm>,
    );
  }

  // todo: validate that the url is publicly accessible before
  // creating the agent, we can just try and hit it here.
  // that should probably be part of createAgent, not here.

  await createAgent(
    c.get("db"),
    user,
    game,
    parsed_form.data.agentname,
    parsed_form.data.url,
  );
  const agent_slug = user.username + "/" + parsed_form.data.agentname;
  const url = `/g/${game}/a/${agent_slug}`;
  const redirect = {
    path: url,
    target: "#main",
  };
  c.res.headers.set("HX-Location", JSON.stringify(redirect));
  return c.render(
    <div>
      <span>Created Agent, redirecting to {url}</span>
    </div>,
  );
});

app.get("/g/:game/a", async (c: GamePlayContext) => {
  const parsed_game = GameKind.safeParse(c.req.param("game"));
  if (!parsed_game.success) {
    return c.notFound();
  }
  const game = parsed_game.data;
  const user = c.get("user");
  if (!user) {
    return c.redirect("/");
  }

  const agents = await findAgentsForGameAndUser(
    c.get("db"),
    game,
    user,
  );

  return c.render(
    <div class="flex flex-col h-full">
      <BreadCrumbs
        links={[
          { href: "/g", text: "Games" },
          {
            href: `/g/${game}`,
            text: game.charAt(0).toUpperCase() + game.slice(1),
          },
          { href: `/g/${game}/a`, text: "Agents" },
        ]}
      >
      </BreadCrumbs>
      <div class="grow">
        <div class="flex">
          <div class="container">
            <CreateAgentForm
              user={user}
              game={game}
              details={{
                values: {
                  agentname: "",
                  url: "",
                },
                errors: {
                  agentname: [],
                  url: [],
                  form: [],
                },
              }}
            />
          </div>
          <div class="container" hx-boost="true" hx-target="#main">
            <Table
              columns={["Id", "Status"]}
              rows={agents.map((agent) => {
                return [
                  <a class="link" href={`/g/${game}/a/${agent.agent_slug}`}>
                    {agent.agent_slug}
                  </a>,
                  <span>{agent.status_kind}</span>,
                ];
              })}
            />
          </div>
        </div>
      </div>
    </div>,
  );
});

app.get("/g/:game/a/:username/:agentname", async (c: GamePlayContext) => {
  const parsed_game = GameKind.safeParse(c.req.param("game"));
  if (!parsed_game.success) {
    return c.notFound();
  }
  const game = parsed_game.data;

  const parsed_username = Name.safeParse(c.req.param("username"));
  if (!parsed_username.success) {
    return c.notFound();
  }
  const username = parsed_username.data;

  const parsed_agentname = Name.safeParse(c.req.param("agentname"));
  if (!parsed_agentname.success) {
    return c.notFound();
  }
  const agentname = parsed_agentname.data;

  const user = c.get("user");
  if (!user) {
    return c.redirect("/");
  }

  const agent = await fetchAgentByUsernameAndAgentname(
    c.get("db"),
    username,
    agentname,
  );
  if (agent instanceof Error) {
    return c.notFound();
  }

  return c.render(
    <div class="flex flex-col h-full">
      <BreadCrumbs
        links={[
          { href: "/g", text: "Games" },
          {
            href: `/g/${game}`,
            text: game.charAt(0).toUpperCase() + game.slice(1),
          },
          { href: `/g/${game}/a`, text: "Agents" },
          {
            href: `/g/${game}/a/${agent.slug}`,
            text: agent.slug,
          },
        ]}
      >
      </BreadCrumbs>
      <div class="grow">
        <div>
          <p>Agent</p>
          <p>{agent.slug}</p>
          <p>{agent.status.status}</p>
          <p>{agent.game}</p>
          <p>{agent.username} {agent.user_id}</p>
          <p>{agent.agentname} {agent.agent_id}</p>
          <p>{agent.status}</p>
          <p>{agent.url}</p>
          <p>{agent.created_at}</p>
        </div>
      </div>
    </div>,
  );
});
