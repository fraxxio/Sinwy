import { afterAll, beforeAll, beforeEach, expect, spyOn, test } from "bun:test";
import { readOutboxEmails } from "@backend/infrastructure/email";
import createApp from "@backend/lib/app";
import db from "@db";
import { user } from "@db/schema/userSchema";
import type { Server } from "bun";
import { eq } from "drizzle-orm";
import { auth } from "../auth";
import { registerAuthRoutes } from "../routes";

let server: Server<never>;
let base: URL;
let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, "fetch">>;
const polarRequests: string[] = [];

// both Polar clients send through the global fetch; Polar is unreachable here
beforeAll(() => {
	const app = createApp();
	registerAuthRoutes(app);
	server = app.listen(0);
	base = server.url;
	const realFetch = globalThis.fetch;
	fetchSpy = spyOn(globalThis, "fetch").mockImplementation(((
		input: string | URL | Request,
		init?: RequestInit,
	) => {
		const url = new URL(input instanceof Request ? input.url : input);
		if (!url.hostname.endsWith("polar.sh")) return realFetch(input, init);
		polarRequests.push(`${init?.method ?? "GET"} ${url.pathname}`);
		return Promise.reject(new TypeError("Unable to connect"));
	}) as typeof fetch);
});

afterAll(() => {
	fetchSpy.mockRestore();
	server.stop(true);
});

beforeEach(async () => {
	await db.delete(user);
	polarRequests.length = 0;
});

const verifyUrlSentTo = async (email: string) => {
	const sent = (await readOutboxEmails()).find(
		(entry) => entry.email.to === email,
	);
	const { verifyUrl } = (sent?.email.props ?? {}) as { verifyUrl?: string };
	if (!verifyUrl) throw new Error(`no verification email to ${email}`);
	const url = new URL(verifyUrl);
	return new URL(url.pathname + url.search, base);
};

test("email sign-up makes no Polar request, and verification and login work while Polar is unreachable", async () => {
	const email = `${crypto.randomUUID()}@sign-up.test`;
	const password = "correct-horse-battery";

	await auth.api.signUpEmail({
		body: { name: "New User", email, password, callbackURL: "/" },
	});
	expect(polarRequests).toEqual([]);

	const verified = await fetch(await verifyUrlSentTo(email), {
		redirect: "manual",
	});
	expect(verified.status).toBeLessThan(400);
	const [row] = await db
		.select({ emailVerified: user.emailVerified })
		.from(user)
		.where(eq(user.email, email));
	expect(row?.emailVerified).toBe(true);

	const signedIn = await auth.api.signInEmail({ body: { email, password } });
	expect(signedIn.token).toBeTruthy();
});
