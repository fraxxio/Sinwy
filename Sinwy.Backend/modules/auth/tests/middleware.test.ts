import { expect, test } from "bun:test";
import { fakeCtx } from "@backend/test/helpers";
import { requireAuth, sessionFrom } from "../middleware";

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
