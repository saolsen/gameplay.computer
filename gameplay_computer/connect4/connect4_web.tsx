/** @jsxImportSource hono/jsx */
import { FC } from "hono/jsx";
import { z } from "zod";

import { Name, Player } from "../../gameplay/game.ts";
import { Connect4CurrentTurn, Connect4MatchView } from "../matches.ts";
import { SelectUser, Unreachable } from "../schema.ts";

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
          <label class="label">
            <span class="label-text">Agent</span>
            <select
              class="select select-bordered w-full max-w-xs"
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
      const active_players = current_turn.status.active_players;
      console.assert(active_players.length === 1);
      player_i = active_players[0];
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
    <div>
      {header}
      {/* Build the board with svg. code based on https://codepen.io/rossta/pen/eyrgJe */}
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
              const color = player_i === 0 ? "text-blue-400" : "text-red-400";
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
  );
};
