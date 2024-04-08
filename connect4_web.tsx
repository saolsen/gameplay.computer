/** @jsxImportSource hono/jsx */
import { FC } from "hono/jsx";
import { z } from "zod";

import { SelectUser, Unreachable } from "./schema.ts";

import { Player } from "./game.ts";
import { Connect4CurrentTurn, Connect4MatchView } from "./matches.ts";

export const CreateConnect4MatchFormData = z.object({
  game: z.literal("connect4"),
  "player_type[0]": z.union([z.literal("me"), z.literal("user")]),
  "player_name[0]": z.string(),
  "player_type[1]": z.union([z.literal("me"), z.literal("user")]),
  "player_name[1]": z.string(),
  "player_error[0]": z.string().optional(),
  "player_error[1]": z.string().optional(),
  form_error: z.string().optional(),
});
export type CreateConnect4MatchFormData = z.infer<
  typeof CreateConnect4MatchFormData
>;

export function validateCreateConnect4MatchForm(
  _user: SelectUser,
  data?: CreateConnect4MatchFormData | undefined
): {
  new_data: CreateConnect4MatchFormData;
  new_match?: {
    players: Player[];
  };
} {
  if (!data) {
    data = {
      game: "connect4",
      "player_type[0]": "me",
      "player_name[0]": "steve",
      "player_type[1]": "me",
      "player_name[1]": "steve",
    };
  }

  const players: Player[] = [];
  const player_0_kind = data["player_type[0]"];
  players.push({
    kind: player_0_kind === "me" ? "user" : player_0_kind,
    username: data["player_name[0]"],
  });
  const player_1_kind = data["player_type[1]"];
  players.push({
    kind: player_1_kind === "me" ? "user" : player_1_kind,
    username: data["player_name[1]"],
  });

  // todo: validate players, pass in the users and agents.
  // or make this async so we can go get them.

  return { new_data: data, new_match: { players } };
}

export const CreateConnect4MatchForm: FC<{
  create_connect4_match: CreateConnect4MatchFormData;
}> = ({ create_connect4_match }) => {
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
                value="user"
                aria-label="User"
                checked={create_connect4_match["player_type[0]"] === "user"}
                hx-get="/g/connect4/m/create_match"
                hx-include="#connect4_create_match_form"
                hx-target="#connect4_create_match_form"
                hx-swap="outerHTML"
              />
            </div>
            <input type="hidden" name="player_name[0]" value="steve" />
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
                value="user"
                aria-label="User"
                checked={create_connect4_match["player_type[1]"] === "user"}
                hx-get="/g/connect4/m/create_match"
                hx-include="#connect4_create_match_form"
                hx-target="#connect4_create_match_form"
                hx-swap="outerHTML"
              />
            </div>
          </div>
          <input type="hidden" name="player_name[1]" value="steve" />
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
              {player?.kind === "user" && player.username === user?.username ? (
                <span class="text-2xl">That's you!</span>
              ) : (
                <span class="text-2xl">
                  Waiting on{" "}
                  {player.kind === "user"
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
              {player?.kind === "user" && player.username === user?.username ? (
                <span class="text-2xl">That's you!</span>
              ) : (
                <span class="text-2xl">
                  Waiting on{" "}
                  {player.kind === "user"
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
          current_turn.status.result.players[0] === 0 ? (
            <span class="text-2xl">Blue wins!</span>
          ) : current_turn.status.result.kind === "winner" &&
            current_turn.status.result.players[0] === 1 ? (
            <span class="text-2xl">Red wins!</span>
          ) : current_turn.status.result.kind === "draw" ? (
            <span class="text-2xl">It's a draw!</span>
          ) : (
            <span class="text-2xl">Error</span>
          )}
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
              const create_turn_url = `/g/connect4/m/${connect4_match.match_id}/turns/create`;
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
                      />
                    );
                  } else {
                    row_elems.push(
                      <circle
                        cx="50"
                        cy={cy}
                        r="45"
                        class="text-red-400 fill-current"
                      />
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
