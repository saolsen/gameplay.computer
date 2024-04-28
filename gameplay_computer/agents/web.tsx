/** @jsxImportSource hono/jsx */
import { z } from "zod";
import { Hono } from "hono";
import { FC } from "npm:hono@4.2.2/jsx";

import { GameKind } from "../../gameplay/mod.ts";
import { GameKindSchema, NameSchema } from "../gameplay_schemas/schema.ts";

import { SelectUser, Url } from "../schema.ts";
import {
  createAgent,
  fetchAgentByUsernameAndAgentname,
  findAgentsForGameAndUser,
} from "../agents/agents.ts";
import { BreadCrumbs, GamePlayContext, Table } from "../web.tsx";

export const app = new Hono();

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
  game: GameKindSchema,
  agentname: NameSchema,
  url: Url,
});
export type CreateAgentFormData = z.infer<typeof CreateAgentFormData>;

app.post("/g/:game/a/create_agent", async (c: GamePlayContext) => {
  const parsed_game = GameKindSchema.safeParse(c.req.param("game"));
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
  const parsed_game = GameKindSchema.safeParse(c.req.param("game"));
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
  const parsed_game = GameKindSchema.safeParse(c.req.param("game"));
  if (!parsed_game.success) {
    return c.notFound();
  }
  const game = parsed_game.data;

  const parsed_username = NameSchema.safeParse(c.req.param("username"));
  if (!parsed_username.success) {
    return c.notFound();
  }
  const username = parsed_username.data;

  const parsed_agentname = NameSchema.safeParse(c.req.param("agentname"));
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
