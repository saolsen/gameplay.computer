/** @jsxImportSource hono/jsx */
import { Context, Hono } from "hono";
import { Child, FC } from "hono/jsx";
import { jsxRenderer, useRequestContext } from "hono/jsx-renderer";
import { html } from "npm:hono/html";
import { getCookie } from "npm:hono/cookie";

import { importSPKI, jwtVerify } from "jose";

import { Connect4Action } from "./connect4/connect4.ts";
import {
  Connect4Match,
  CreateConnect4MatchForm,
  CreateConnect4MatchFormData,
  validateCreateConnect4MatchForm,
} from "./connect4/connect4_web.tsx";

import { GamePlayDB, MatchId, SelectUser, Unreachable } from "./schema.ts";
import { ClerkUser, syncClerkUser } from "./users.ts";
import { GameKind } from "./game.ts";
import {
  createMatch,
  fetchMatchById,
  findMatchesForGameAndUser,
  MatchView,
  takeMatchUserTurn,
} from "./matches.ts";
import { tracedPromise } from "./tracing.ts";

export function background<
  // deno-lint-ignore no-explicit-any
  F extends (...args: any[]) => Promise<void>
>(task_name: string, fn: F, ...args: Parameters<F>): Promise<void> {
  return tracedPromise<void, F>(`background: ${task_name}`, fn, ...args).catch(
    (e) => {
      console.error(`Background task ${task_name} failed:`, e);
    }
  );
}

export type ContextVars = {
  // Set by the wrapping app.
  db: GamePlayDB;
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
        ></meta>
        <title>Gameplay</title>
        <link
          href="https://unpkg.com/@tailwindcss/typography@0.5.0/dist/typography.min.css"
          rel="stylesheet"
          type="text/css"
        ></link>
        <link
          href="https://cdn.jsdelivr.net/npm/daisyui@4.7.3/dist/full.min.css"
          rel="stylesheet"
          type="text/css"
        />
        <script src="https://cdn.tailwindcss.com"></script>
        <script src="https://unpkg.com/htmx.org@1.9.11"></script>
        <script src="https://unpkg.com/htmx.org@1.9.11/dist/ext/sse.js"></script>
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
          src={
            clerk_frontend_api + "/npm/@clerk/clerk-js@4/dist/clerk.browser.js"
          }
          type="text/javascript"
          onload="loadClerk()"
        ></script>
      </head>
      <body class="h-screen flex flex-col">
        {server_signed_in ? (
          <LoggedInNav></LoggedInNav>
        ) : (
          <LoggedOutNav></LoggedOutNav>
        )}
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
          {columns.map((column) => (
            <th>{column}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr>
            {row.map((cell) => (
              <td>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          {columns.map((column) => (
            <th>{column}</th>
          ))}
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
  })
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
        <p>
          <a class="link" href="/g/connect4/m">
            Matches
          </a>
        </p>
      </div>
    );
  } else {
    return c.render(
      <div>
        <span>Log in to get started.</span>
      </div>
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
    </div>
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
    user.user_id
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
      ></BreadCrumbs>
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
            ></Table>
          </div>
          <div class="container" hx-boost="true" hx-target="#main">
            <a class="link" href={`/g/${game}/a`}>
              <h2 class="text-4xl">Agents</h2>
            </a>
            <Table columns={["Id", "Link"]} rows={[]}></Table>
          </div>
        </div>
      </div>
    </div>
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
    user.user_id
  );

  let form;
  switch (game) {
    case "connect4": {
      const { new_data } = validateCreateConnect4MatchForm(user);
      form = (
        <CreateConnect4MatchForm
          create_connect4_match={new_data}
        ></CreateConnect4MatchForm>
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
      ></BreadCrumbs>
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
            ></Table>
          </div>
        </div>
      </div>
    </div>
  );
});

app.get("/g/:game/m/create_match", (c: GamePlayContext) => {
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
      const { new_data } = validateCreateConnect4MatchForm(user, form);
      return c.render(
        <CreateConnect4MatchForm
          create_connect4_match={new_data}
        ></CreateConnect4MatchForm>
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

  switch (game) {
    case "connect4": {
      const parsed_form = CreateConnect4MatchFormData.safeParse(current_data);
      let form: CreateConnect4MatchFormData | undefined;
      if (parsed_form.success) {
        form = parsed_form.data;
      }
      const { new_data, new_match: new_match_spec } =
        validateCreateConnect4MatchForm(user, form);
      if (!new_match_spec) {
        return c.render(
          <CreateConnect4MatchForm
            create_connect4_match={new_data}
          ></CreateConnect4MatchForm>
        );
      }

      const { players } = new_match_spec;
      const new_match = await createMatch(
        c.get("db"),
        user,
        players,
        "connect4"
      );
      if (new_match instanceof Error) {
        new_data.form_error = new_match.message;

        return c.render(
          <CreateConnect4MatchForm
            create_connect4_match={new_data}
          ></CreateConnect4MatchForm>
        );
      }

      match_id = new_match;
      break;
    }
    default: {
      throw new Unreachable(game);
    }
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
    </div>
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

  if (current_turn.status.status === "in_progress") {
    const player_indexes = new Set();
    for (let i = 0; i < match_view.players.length; i++) {
      const player = match_view.players[i];
      if (player.kind === "user" && player.username === user.username) {
        player_indexes.add(i);
      }
    }
    for (const player_i of current_turn.status.active_players) {
      if (player_indexes.has(player_i)) {
        return (
          <div>
            <div class="container">{children}</div>
          </div>
        );
      }
    }
    // Poll for updates if the player is not active.
    return (
      <div
        hx-get={`/g/${game}/m/${match_id}`}
        hx-trigger="load delay:500ms"
        hx-target="#match"
      >
        {children}
      </div>
    );
  }
  return (
    <div>
      <div class="container">{children}</div>
    </div>
  );
};

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

  switch (game) {
    case "connect4": {
      inner_view = (
        <Connect4Match user={user} connect4_match={match_view}></Connect4Match>
      );
      break;
    }
    default: {
      throw new Unreachable(game);
    }
  }

  if (c.req.header("hx-target") === "match") {
    return c.render(
      <Match user={user} match_view={match_view}>
        {inner_view}
      </Match>
    );
  }

  return c.render(
    <div>
      <BreadCrumbs
        links={[
          { href: "/g", text: "Games" },
          { href: `/g/${game}`, text: "Connect4" },
          { href: `/g/${game}/m`, text: "Matches" },
          { href: `/g/${game}/m/${match_id}`, text: match_id },
        ]}
      ></BreadCrumbs>
      <div id="match">
        <Match user={user} match_view={match_view}>
          {inner_view}
        </Match>
      </div>
    </div>
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
          { status: 400 }
        );
      }
      const action = parsed_action.data;
      // todo: Have this return the match view so we can do read-after-write.
      const result = await takeMatchUserTurn(c.get("db"), user, match_id, {
        game,
        action,
      });
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

  switch (game) {
    case "connect4": {
      inner_view = (
        <Connect4Match user={user} connect4_match={match_view}></Connect4Match>
      );
      break;
    }
    default: {
      throw new Unreachable(game);
    }
  }

  background("test", async () => {
    await sleep();
    console.log("Background do the agent turn");
    //throw new Error("Background error");
  });

  return c.render(
    <Match user={user} match_view={match_view}>
      {inner_view}
    </Match>
  );
});

export function sleep(milliseconds = 3000) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
