/** @jsxImportSource hono/jsx */
import { z } from "zod";
import { Hono } from "hono";
import { Child, FC } from "npm:hono@4.2.2/jsx";
import { streamSSE } from "hono/streaming";

import { GameKind, Name, Player, Unreachable } from "../games/game.ts";
import { Connect4Action } from "../games/connect4/connect4.ts";
import { cardToString, PokerAction } from "../games/poker/poker.ts";

import { AgentSlug, MatchId, SelectUser } from "../schema.ts";
import {
  findAgentsForGame,
  findAgentsForGameAndUser,
} from "../agents/agents.ts";
import {
  Connect4CurrentTurn,
  Connect4MatchView,
  createMatch,
  fetchMatchById,
  findMatchesForGameAndUser,
  MatchView,
  PokerMatchView,
  takeMatchUserTurn,
} from "./matches.ts";
import { queueTask } from "../tasks.ts";
import { BreadCrumbs, GamePlayContext, Table } from "../web.tsx";

const CreateMatchFormData = z.record(z.string()).transform((data) => {
  // Turn all the player_type[i] and player_name[i]
  // fields into a players array.
  const players: { type?: string; name?: string }[] = [];
  for (const key in data) {
    const match = key.match(/(player_)(\w*)(\[)(\d*)(\])/);
    if (match) {
      const [_, __, field, ___, i_s, ____] = match;
      if (field === "type" || field === "name") {
        const i = parseInt(i_s);
        const player = players[i] || {};
        player[field] = data[key];
        players[i] = player;
        delete data[key];
      }
    }
  }
  return { game: data.game, players };
}).pipe(z.object({
  game: GameKind,
  players: z.array(z.object({
    type: z.union([z.literal("me"), z.literal("agent")]),
    name: z.string(),
  })),
}));
export type CreateMatchFormData = z.infer<typeof CreateMatchFormData>;

export const CreateMatchFormDetails = z.object({
  values: CreateMatchFormData,
  errors: z.object({
    players: z.array(z.string()),
    form: z.string(),
  }),
});
export type CreateMatchFormDetails = z.infer<typeof CreateMatchFormDetails>;

function playerInputs(
  user: SelectUser,
  usernames: Name[],
  agent_slugs: AgentSlug[],
  create_match: CreateMatchFormDetails,
): Child[] {
  const players = create_match.values.players;

  const player_inputs = [];
  for (let i = 0; i < players.length; i++) {
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
        const parsed_slug = AgentSlug.safeParse(players[i].name);
        if (!parsed_slug.success) {
          players[i].name = "";
        } else {
          const slug = parsed_slug.data;
          if (!agent_slugs.includes(slug)) {
            players[i].name = "";
          }
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

  return player_inputs;
}

export const CreateConnect4MatchForm: FC<{
  user: SelectUser;
  usernames: Name[];
  agent_slugs: AgentSlug[];
  create_match: CreateMatchFormDetails;
}> = ({ user, usernames, agent_slugs, create_match }) => {
  const players = create_match.values.players;
  const player_inputs = playerInputs(
    user,
    usernames,
    agent_slugs,
    create_match,
  );

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
                checked={players[0].type === "me"}
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
                checked={players[0].type === "agent"}
                hx-get="/g/connect4/m/create_match"
                hx-include="#connect4_create_match_form"
                hx-target="#connect4_create_match_form"
                hx-swap="outerHTML"
              />
            </div>
            {player_inputs[0]}
            {create_match.errors.players[0] && (
              <div class="alert alert-error" role="alert">
                <span>{create_match.errors.players[0]}</span>
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
                checked={players[1].type === "me"}
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
                checked={players[1].type === "agent"}
                hx-get="/g/connect4/m/create_match"
                hx-include="#connect4_create_match_form"
                hx-target="#connect4_create_match_form"
                hx-swap="outerHTML"
              />
            </div>
          </div>
          {player_inputs[1]}
          {create_match.errors.players[1] && (
            <div class="alert alert-error" role="alert">
              <span>{create_match.errors.players[1]}</span>
            </div>
          )}
        </div>
        <div>
          {create_match.errors.form && (
            <div class="alert alert-error join-item" role="alert">
              <span>{create_match.errors.form}</span>
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

export const CreatePokerMatchForm: FC<{
  user: SelectUser;
  usernames: Name[];
  agent_slugs: AgentSlug[];
  create_match: CreateMatchFormDetails;
}> = ({ user, usernames, agent_slugs, create_match }) => {
  const players = create_match.values.players;

  const player_inputs = playerInputs(
    user,
    usernames,
    agent_slugs,
    create_match,
  );

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
        {players.map((player, i) => {
          return (
            <div>
              <div class="flex">
                <h3 class="text-3xl">Player {i + 1}</h3>
                {players.length > 2 && (
                  <button
                    class="btn btn-outline"
                    hx-get="/g/poker/m/create_match"
                    hx-include="#poker_create_match_form"
                    hx-target="#poker_create_match_form"
                    hx-swap="outerHTML"
                    hx-vals={JSON.stringify({
                      action: "remove_player",
                      player_i: i,
                    })}
                  >
                    - Remove Player
                  </button>
                )}
              </div>
              <div class="form-control">
                <span class="label-text">Type</span>
                <div class="join">
                  <input
                    class="join-item btn"
                    type="radio"
                    name={`player_type[${i}]`}
                    value="me"
                    aria-label="Me"
                    checked={players[i].type === "me"}
                    hx-get="/g/poker/m/create_match"
                    hx-include="#poker_create_match_form"
                    hx-target="#poker_create_match_form"
                    hx-swap="outerHTML"
                  />
                  <input
                    class="join-item btn"
                    type="radio"
                    name={`player_type[${i}]`}
                    value="agent"
                    aria-label="Agent"
                    checked={players[i].type === "agent"}
                    hx-get="/g/poker/m/create_match"
                    hx-include="#poker_create_match_form"
                    hx-target="#poker_create_match_form"
                    hx-swap="outerHTML"
                  />
                </div>
                {player_inputs[i]}
                {create_match.errors.players[i] && (
                  <div class="alert alert-error" role="alert">
                    <span>{create_match.errors.players[i]}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <button
          class="btn btn-outline"
          hx-get="/g/poker/m/create_match"
          hx-include="#poker_create_match_form"
          hx-target="#poker_create_match_form"
          hx-swap="outerHTML"
          hx-vals={JSON.stringify({ action: "add_player" })}
        >
          + Add Player
        </button>
        <div>
          {create_match.errors.form && (
            <div class="alert alert-error join-item" role="alert">
              <span>{create_match.errors.form}</span>
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
          {round.table_cards.map((card) => (
            <div>
              <div class="card w-55 bg-base-400 shadow-xl">
                <div class="card-body items-center text-center">
                  <p>{cardToString(card)}</p>
                </div>
              </div>
            </div>
          ))}
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
                {poker_match.current_turn.status.status === "in_progress" && (
                  <span>status: {round.player_status[i]}</span>
                )}
                {poker_match.current_turn.status.status === "in_progress" &&
                  i === round.current_player && (
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

export const app = new Hono();

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
          create_match={{
            values: {
              game: "connect4",
              players: [
                { type: "me", name: user.username },
                { type: "me", name: user.username },
              ],
            },
            errors: {
              players: ["", ""],
              form: "",
            },
          }}
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
          create_match={{
            values: {
              game: "poker",
              players: [
                { type: "me", name: user.username },
                { type: "me", name: user.username },
              ],
            },
            errors: {
              players: ["", ""],
              form: "",
            },
          }}
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

  const parsed_form = CreateMatchFormData.safeParse(current_data);
  let form: CreateMatchFormData | undefined;
  if (parsed_form.success) {
    form = parsed_form.data;
  }

  const usernames: Name[] = [];
  const agent_slugs = await findAgentsForGame(c.get("db"), game);

  switch (game) {
    case "connect4": {
      return c.render(
        <CreateConnect4MatchForm
          user={user}
          usernames={usernames}
          agent_slugs={agent_slugs}
          create_match={{
            values: form || {
              game: game,
              players: [
                { type: "me", name: user.username },
                { type: "me", name: user.username },
              ],
            },
            errors: {
              players: ["", ""],
              form: "",
            },
          }}
        />,
      );
    }
    case "poker": {
      if (!form) {
        return c.render(
          <CreatePokerMatchForm
            user={user}
            usernames={usernames}
            agent_slugs={agent_slugs}
            create_match={{
              values: {
                game: game,
                players: [
                  { type: "me", name: user.username },
                  { type: "me", name: user.username },
                ],
              },
              errors: {
                players: ["", ""],
                form: "",
              },
            }}
          />,
        );
      }

      const action = c.req.query("action");
      switch (action) {
        case "add_player": {
          form.players.push({ type: "me", name: user.username });
          break;
        }
        case "remove_player": {
          const player_i = c.req.query("player_i");
          if (player_i === undefined) {
            break;
          }
          const i = parseInt(player_i, 10);
          form.players.splice(i, 1);
          break;
        }
        default: {
          break;
        }
      }

      return c.render(
        <CreatePokerMatchForm
          user={user}
          usernames={usernames}
          agent_slugs={agent_slugs}
          create_match={{
            values: form || {
              game: "poker",
              players: [
                { type: "me", name: user.username },
                { type: "me", name: user.username },
              ],
            },
            errors: {
              players: ["", ""],
              form: "",
            },
          }}
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

  const usernames: Name[] = [];
  const agent_slugs = await findAgentsForGame(c.get("db"), game);

  let form: CreateMatchFormData;
  const players: Player[] = [];

  let error = false;
  const player_errors: string[] = ["", ""];
  let form_error = "";

  validation: {
    const parsed_form = CreateMatchFormData.safeParse(current_data);
    if (parsed_form.success) {
      form = parsed_form.data;
    } else {
      switch (game) {
        case "connect4": {
          form = {
            game: game,
            players: [
              { type: "me", name: user.username },
              { type: "me", name: user.username },
            ],
          };
          break;
        }
        case "poker": {
          form = {
            game: game,
            players: [
              { type: "me", name: user.username as string },
              { type: "me", name: user.username as string },
            ],
          };
          break;
        }
        default: {
          throw new Unreachable(game);
        }
      }
      error = true;
      break validation;
    }

    // Validate Players
    for (let i = 0; i < form.players.length; i++) {
      const player = form.players[i];
      switch (player.type) {
        case "me": {
          // name must be the user's name.
          const parsed_username = Name.safeParse(player.name);
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
          const parsed_slug = AgentSlug.safeParse(player.name);
          if (!parsed_slug.success) {
            error = true;
            player_errors[i] = "Invalid agent name.";
            break;
          }
          const slug = parsed_slug.data;

          if (!agent_slugs.includes(slug)) {
            error = true;
            player_errors[i] = "Invalid agent name.";
            break;
          }

          const [username, agentname] = slug.split("/") as [Name, Name];

          players.push({
            kind: "agent",
            username,
            agentname,
          });
          break;
        }
        default: {
          throw new Unreachable(player.type);
        }
      }
    }

    if (error) {
      break validation;
    }

    // Game Specific Validation
    switch (game) {
      case "connect4": {
        if (form.players.length !== 2) {
          error = true;
          form_error = "Invalid number of players.";
        }
        break;
      }
      case "poker": {
        break;
      }
      default: {
        throw new Unreachable(game);
      }
    }
  }

  if (error) {
    switch (game) {
      case "connect4": {
        return c.render(
          <CreateConnect4MatchForm
            user={user}
            usernames={usernames}
            agent_slugs={agent_slugs}
            create_match={{
              values: form,
              errors: {
                players: player_errors,
                form: form_error,
              },
            }}
          />,
        );
      }
      case "poker": {
        return c.render(
          <CreatePokerMatchForm
            user={user}
            usernames={usernames}
            agent_slugs={agent_slugs}
            create_match={{
              values: form,
              errors: {
                players: player_errors,
                form: form_error,
              },
            }}
          />,
        );
      }
      default: {
        throw new Unreachable(game);
      }
    }
  }

  const new_match = await createMatch(
    c.get("db"),
    c.get("kv"),
    user,
    players,
    game,
  );
  if (new_match instanceof Error) {
    switch (game) {
      case "connect4": {
        return c.render(
          <CreateConnect4MatchForm
            user={user}
            usernames={usernames}
            agent_slugs={agent_slugs}
            create_match={{
              values: form,
              errors: {
                players: player_errors,
                form: new_match.message,
              },
            }}
          />,
        );
      }
      case "poker": {
        return c.render(
          <CreatePokerMatchForm
            user={user}
            usernames={usernames}
            agent_slugs={agent_slugs}
            create_match={{
              values: form,
              errors: {
                players: player_errors,
                form: new_match.message,
              },
            }}
          />,
        );
      }
      default: {
        throw new Unreachable(game);
      }
    }
  }

  const { match_id, first_player_agent } = new_match;

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
