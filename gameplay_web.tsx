/** @jsxImportSource npm:hono@4.2.2/jsx */
import { Hono, Context } from "npm:hono@4.2.2";
import { getCookie } from "npm:hono@4.2.2/cookie";
import { html } from "npm:hono@4.2.2/html";
import { Child, FC } from "npm:hono@4.2.2/jsx";
import { jsxRenderer, useRequestContext } from "npm:hono@4.2.2/jsx-renderer";
import { importSPKI, jwtVerify } from "npm:jose@5.2.3";

import { SelectUser, GamePlayDB } from "./gameplay_schema.ts";
import { syncClerkUser, ClerkUser } from "./gameplay_users.tsx";

export type ContextVars = {
  // Set by the wrapping app.
  db: GamePlayDB;
  clerk_publishable_key: string;
  clerk_frontend_api: string;
  clerk_jwt_key: string;

  // Set by middleware.
  user?: SelectUser;
}

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
            clerk_frontend_api +
            "/npm/@clerk/clerk-js@4/dist/clerk.browser.js"
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

export const Layout: FC<{ children: Child }> = ({ children }) => {
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

export const app = new Hono();

app.use("*", async (c: GamePlayContext, next) => {
  const session_cookie = getCookie(c, "__session");
  if (session_cookie) {
    const clerk_jwt_key = c.get("clerk_jwt_key")!.replaceAll("|", "\n");
    const jwt_key = await importSPKI(clerk_jwt_key, "RS256");
    try {
      const decoded = await jwtVerify(session_cookie, jwt_key);
      const clerk_user = ClerkUser.parse(decoded.payload);
      const db = c.get("db");
      const user = await syncClerkUser(db, clerk_user);
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