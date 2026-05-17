import createApp from "@backend/lib/app";
import appConfig from "@config";
import type { User } from "@sinwy/shared";

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
const user: User = { id: 1, name: "John Doe" };

app.route(
	"/posts",
	async (c) => {
		console.log("HANDLING: ", JSON.stringify(c.req.method));
		const body = c.req.method === "POST" ? await c.req.json() : "test";

		return Response.json(body);
	},
	{ method: ["POST", "GET"] },
);

const server = app.listen(appConfig.PORT);

console.log(`Listening on ${server.url}, port ${server.port}`);
