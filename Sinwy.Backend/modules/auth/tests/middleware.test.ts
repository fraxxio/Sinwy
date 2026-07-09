import { expect, test } from "bun:test";
import type { IReqContext } from "@backend/lib/app/types";
import type { ReqContextValues } from "@backend/lib/sharedTypes";
import { requireAuth, sessionFrom } from "../middleware";

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

test("requireAuth without a session cookie → 401 envelope", async () => {
	const res = await requireAuth(fakeCtx(), async () => new Response("next"));

	expect(res.status).toBe(401);
	expect(await res.json()).toEqual({
		isSuccess: false,
		data: null,
		message: "Unauthorized",
		code: 401,
	});
});

test("sessionFrom throws when requireAuth did not run", () => {
	expect(() => sessionFrom(fakeCtx())).toThrow();
});
