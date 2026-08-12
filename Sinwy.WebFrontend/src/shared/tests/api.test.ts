import { afterEach, expect, it, mock } from "bun:test";
import appConfig from "@config";
import type { ApiResponse } from "@sinwy/shared";
import { api } from "../lib/api";

const realFetch = globalThis.fetch;

function stubConfig(overrides: Partial<typeof appConfig>) {
	mock.module("@config", () => ({ default: { ...appConfig, ...overrides } }));
}

afterEach(() => {
	globalThis.fetch = realFetch;
	mock.module("@config", () => ({ default: appConfig }));
});

function stubFetch(impl: (input: string) => Promise<Response>) {
	globalThis.fetch = impl as unknown as typeof fetch;
}

it("reports an unreachable server as code 0", async () => {
	stubFetch(() => Promise.reject(new TypeError("Failed to fetch")));

	const res = await api("/anything");

	expect(res).toEqual({
		isSuccess: false,
		data: null,
		message: "Network error",
		code: 0,
	});
});

it("keeps the status when the body isn't our envelope", async () => {
	stubFetch(() =>
		Promise.resolve(
			new Response("<html>bad gateway</html>", {
				status: 502,
				headers: { "Content-Type": "text/html" },
			}),
		),
	);

	const res = await api("/anything");

	expect(res.isSuccess).toBe(false);
	expect(res.code).toBe(502);
});

// bun test is a server runtime, so these exercise the server half of the
// isomorphic split, in the browser the same call is relative and same-origin
it("addresses the backend absolutely when there is no origin", async () => {
	stubConfig({ BACKEND_URL: "http://backend.internal:3001" });
	let seen = "";
	stubFetch((input) => {
		seen = input;
		return Promise.resolve(Response.json({ isSuccess: true }));
	});

	await api("/user/flags");

	expect(seen).toBe("http://backend.internal:3001/api/user/flags");
});

it("passes an envelope through untouched", async () => {
	const envelope = {
		isSuccess: true,
		data: { status: "active" },
		message: null,
		code: 0,
	} satisfies ApiResponse<{ status: string }>;
	stubFetch(() => Promise.resolve(Response.json(envelope)));

	expect(await api("/organizations/1/status")).toEqual(envelope);
});
