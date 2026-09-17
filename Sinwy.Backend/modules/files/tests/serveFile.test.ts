import { afterAll, beforeAll, expect, test } from "bun:test";
import { storageClient } from "@backend/infrastructure/storage";
import createApp from "@backend/lib/app";
import type { Server } from "bun";
import { registerFileRoutes } from "../routes";

let server: Server<never>;
let base: URL;

const KEY = "test/serve-file.txt";

beforeAll(async () => {
	const app = createApp();
	registerFileRoutes(app);
	server = app.listen(0);
	base = server.url;
	await storageClient.put(KEY, new TextEncoder().encode("hello"), "text/plain");
});

afterAll(async () => {
	await storageClient.delete(KEY);
	server.stop(true);
});

test("serves a stored object", async () => {
	const res = await fetch(new URL(`/api/files/${KEY}`, base));
	expect(res.status).toBe(200);
	expect(await res.text()).toBe("hello");
});

test("unknown key → 404", async () => {
	const res = await fetch(new URL("/api/files/avatars/nobody/x.png", base));
	expect(res.status).toBe(404);
});

test("empty key → 404", async () => {
	const res = await fetch(new URL("/api/files/", base));
	expect(res.status).toBe(404);
});

test("malformed escape → 404", async () => {
	const res = await fetch(new URL("/api/files/%E0%A4%A", base));
	expect(res.status).toBe(404);
});

test("encoded traversal → 404", async () => {
	const res = await fetch(
		new URL("/api/files/%2e%2e%2f%2e%2e%2fpackage.json", base),
	);
	expect(res.status).toBe(404);
});
