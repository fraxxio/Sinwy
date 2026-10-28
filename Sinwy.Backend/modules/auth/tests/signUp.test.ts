import { afterAll, beforeAll, beforeEach, expect, spyOn, test } from "bun:test";
import dns from "node:dns/promises";
import { readOutboxEmails } from "@backend/infrastructure/email";
import createApp from "@backend/lib/app";
import { createUserWithSession } from "@backend/test/helpers";
import db from "@db";
import { user } from "@db/schema/userSchema";
import { AUTH_ERROR_CODES } from "@sinwy/shared";
import type { Server } from "bun";
import { eq } from "drizzle-orm";
import { auth } from "../auth";
import { registerAuthRoutes } from "../routes";

let server: Server<never>;
let base: URL;
let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, "fetch">>;
const dnsSpies: ReturnType<typeof spyOn>[] = [];
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
	const notFound = Object.assign(new Error("queryMx ENOTFOUND"), {
		code: "ENOTFOUND",
	});
	for (const method of ["resolveMx", "resolve4", "resolve6"] as const)
		dnsSpies.push(spyOn(dns, method).mockRejectedValue(notFound));
});

afterAll(() => {
	fetchSpy.mockRestore();
	for (const spy of dnsSpies) spy.mockRestore();
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

const emailsTo = async (address: string) =>
	(await readOutboxEmails()).filter((entry) => entry.email.to === address);

test("sign-up with a domain that can't receive mail is refused, with no user and no email", async () => {
	const email = `${crypto.randomUUID()}@gmail.con`;

	const refused = auth.api.signUpEmail({
		body: { name: "New User", email, password: "correct-horse-battery" },
	});

	await expect(refused).rejects.toMatchObject({
		statusCode: 400,
		body: { code: AUTH_ERROR_CODES.EMAIL_DOMAIN_INVALID },
	});
	const rows = await db
		.select({ id: user.id })
		.from(user)
		.where(eq(user.email, email));
	expect(rows).toEqual([]);
	expect(await emailsTo(email)).toEqual([]);
});

const changeEmail = (cookie: string, newEmail: string) =>
	fetch(new URL("/api/auth/change-email", base), {
		method: "POST",
		headers: { "content-type": "application/json", cookie },
		body: JSON.stringify({ newEmail, callbackURL: "/account/settings" }),
	});

const confirmationsFor = async (newEmail: string) =>
	(await readOutboxEmails()).filter(
		(entry) =>
			(entry.email.props as { newEmail?: string } | undefined)?.newEmail ===
			newEmail,
	);

test("an email change to a domain that can't receive mail is refused and sends no confirmation", async () => {
	const { cookie } = await createUserWithSession();
	const refusedEmail = `${crypto.randomUUID()}@gmail.con`;
	const acceptedEmail = `${crypto.randomUUID()}@sign-up.test`;

	const refused = await changeEmail(cookie, refusedEmail);
	expect(refused.status).toBe(400);
	expect(await refused.json()).toMatchObject({
		code: AUTH_ERROR_CODES.EMAIL_DOMAIN_INVALID,
		message: "Enter a valid email",
	});
	expect(await confirmationsFor(refusedEmail)).toEqual([]);

	expect((await changeEmail(cookie, acceptedEmail)).status).toBe(200);
	expect(await confirmationsFor(acceptedEmail)).toHaveLength(1);
});
