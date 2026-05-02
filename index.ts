import { SERVER } from "./appConfig";

const server = Bun.serve({
    port: SERVER.port,
    routes: {
        "/": () => new Response('Bun!'),
    }
});

console.log(`Listening on ${server.url}`);