const [agent_name, port] = Deno.args;
console.log("Agent:", agent_name);
const agent = await import("./" + agent_name + ".ts");
Deno.serve({ port: Number(port) }, agent.default);
