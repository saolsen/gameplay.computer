/** @jsxImportSource hono/jsx */
import { importSPKI, jwtVerify } from "jose";
import { Context, Hono } from "hono";
import { Child, FC } from "hono/jsx";
import { jsxRenderer, useRequestContext } from "hono/jsx-renderer";
import { html } from "hono/html";
import { getCookie } from "hono/cookie";

import { GamePlayDB, SelectUser } from "./schema.ts";
import { ClerkUser, syncClerkUser } from "./users.ts";

import { app as agents_app } from "./agents/web.tsx";
import { app as matches_app } from "./matches/web.tsx";

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
          <span id="spinner" class="group">
            <span
              id="spinner"
              class="loading loading-spinner loading-md
                    mx-4 hidden group-[.htmx-request]:block"
            >
            </span>
          </span>
        </div>
        <div class="flex-none">
          <ul class="menu menu-horizontal px-1">
            <li>
              <a class="btn btn-ghost" href="/g">
                Games
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
  const c: GamePlayContext = useRequestContext();
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
      <body class="h-screen flex flex-col" hx-indicator="#spinner">
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

export const BreadCrumbs: FC<{
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

export const Table: FC<{ columns: string[]; rows: JSX.Element[][] }> = ({
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

app.get("/static/connect4.png", async (c: GamePlayContext) => {
  c.res.headers.set("Content-Type", "image/png");
  return c.body(await Deno.readFile("./gameplay_computer/static/connect4.png"));
});

app.get("/static/poker.png", async (c: GamePlayContext) => {
  c.res.headers.set("Content-Type", "image/png");
  return c.body(await Deno.readFile("./gameplay_computer/static/poker.png"));
});

app.route("/", agents_app);
app.route("/", matches_app);

app.get("/", (c: GamePlayContext) => {
  const user = c.get("user");
  if (user) {
    return c.render(
      <div hx-boost="true" hx-target="#main">
        <p>Hello, {user.username}</p>
        <p>
          Click{" "}
          <a class="link" href="/g">
            Games
          </a>{" "}
          to try out the games and play against some existing agents.
        </p>
        <p>
          To create your own agent, see the docs at{" "}
          <a class="link" href="https://jsr.io/@gameplay/games">
            @gameplay/games
          </a>
        </p>
        <p>
          There's also a{" "}
          <a class="link" href="https://discord.gg/3c9w2AqygD">discord</a>
        </p>
      </div>,
    );
  } else {
    return c.render(
      <div class="flex flex-col gap-4 text-xl">
        <h1 class="text-4xl">Welcome to Gameplay</h1>
        <p>
          Gameplay is a game agent battleground.
        </p>
        <p>
          You can create agents (programs) that play different games, play
          against them, and pit them against other players' agents.
        </p>
        <p>
          <a class="link" href="https://jsr.io/@gameplay/games">
            https://jsr.io/@gameplay/games
          </a>{" "}
          are the docs for making agents and the code is{" "}
          <a class="link" href="https://github.com/saolsen/gameplay.computer">
            https://github.com/saolsen/gameplay.computer
          </a>
        </p>
        <p>
          Agents can be in any language (but typescript / javascript is the
          easiest since you can leverage the actual game logic code). Each agent
          is an HTTP service. When it's the agent's turn it gets POSTed the
          current game state and it replies with the action it wants to take.
        </p>
        <p>
          The easiest / best place to host an agent is on{" "}
          <a class="link" href="https://val.town">val.town</a>. You can see some
          examples of my agents{" "}
          <a
            class="link"
            href="https://www.val.town/v/saolsen/connect4_agent_mcts"
          >
            connect4_agent_mcts
          </a>{" "}
          and{" "}
          <a
            class="link"
            href="https://www.val.town/v/saolsen/poker_agent_all_in"
          >
            poker_agent_all_in
          </a>.
        </p>

        <p>
          <a
            class="btn btn-primary"
            role="button"
            href="#"
            onclick="window.Clerk.openSignUp({redirectUrl: '/'})"
          >
            Sign Up
          </a>{" "}
          or{" "}
          <a
            class="btn"
            role="button"
            href="#"
            onclick="window.Clerk.openSignIn({redirectUrl: '/'})"
          >
            Log In
          </a>{" "}
          to get started.
        </p>
      </div>,
    );
  }
});
