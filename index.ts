import { SERVER } from "./appConfig";
import createApp from "./lib/app";

const app = createApp();

app.use(async (c, next) => {
	console.log(`${c.req.method} ${c.req.url}`);
	if (c.req.url.endsWith("/posts")) {
		c.set("testas", true);
	}

	return next();
});

app.route("/", () => new Response("Hello world"));

app.route("/users/:id", (c) => {
	return new Response(`User ${c.req.params.id}`);
});

app.route(
	"/posts",
	async (c) => {
		console.log("HANDLING: ", JSON.stringify(c.req.method));
		const body = c.req.method === "POST" ? await c.req.json() : "test";

		return Response.json(body);
	},
	{ method: ["POST", "GET"] },
);

const server = app.listen(SERVER.port);

console.log(`Listening on ${server.url}, port ${server.port}`);
