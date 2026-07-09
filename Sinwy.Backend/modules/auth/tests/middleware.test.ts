import { expect, mock, test } from "bun:test";
import type { IReqContext } from "@backend/lib/app/types";
import type { ReqContextValues } from "@backend/lib/sharedTypes";

let currentSession: ReqContextValues["session"] | null = null;

mock.module("../auth", () => ({
	auth: { api: { getSession: async () => currentSession } },
}));

const { requireAuth, sessionFrom } = await import("../middleware");

const fakeCtx = (): IReqContext => {
	const store: Partial<ReqContextValues> = {};
	return {
		req: new Request("http://localhost/") as IReqContext["req"],
		set: (key, value) => {
			store[key] = value;
		},
		get: (key) => store[key],
	};
};

test("requireAuth returns 401 envelope without a session", async () => {
	currentSession = null;
	const res = await requireAuth(fakeCtx(), async () => new Response("next"));

	expect(res.status).toBe(401);
	expect(await res.json()).toEqual({
		isSuccess: false,
		data: null,
		message: "Unauthorized",
		code: 401,
	});
});

test("requireAuth stores the session and calls next", async () => {
	currentSession = {
		user: { id: "user_1" },
		session: { id: "session_1" },
	} as ReqContextValues["session"];

	const ctx = fakeCtx();
	const res = await requireAuth(ctx, async () => new Response("next"));

	expect(await res.text()).toBe("next");
	expect(sessionFrom(ctx).user.id).toBe("user_1");
});

test("sessionFrom throws when requireAuth did not run", () => {
	expect(() => sessionFrom(fakeCtx())).toThrow();
});
