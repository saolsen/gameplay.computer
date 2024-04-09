import agent from "./connect4_agent_example.ts";

Deno.serve({ port: 8001 }, agent);
