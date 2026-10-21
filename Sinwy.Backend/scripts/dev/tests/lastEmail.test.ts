import { afterAll, beforeAll, beforeEach, expect, spyOn, test } from "bun:test";
import { auth, registerAuthRoutes } from "@authModule";
import { polarClient } from "@backend/infrastructure/polar";
import createApp from "@backend/lib/app";
import db from "@db";
import { user } from "@db/schema/userSchema";
import type { Server } from "bun";
import { eq } from "drizzle-orm";
import { lastEmails } from "../lastEmail";

let server: Server<never>;
let base: URL;
let updateSpy: ReturnType<typeof spyOn>;

beforeAll(() => {
	// verifying the email updates the user, which the polar plugin syncs to Polar
	updateSpy = spyOn(polarClient.customers, "updateExternal").mockResolvedValue(
		{} as never,
	);
	const app = createApp();
	registerAuthRoutes(app);
	server = app.listen(0);
	base = server.url;
});

afterAll(() => {
	updateSpy.mockRestore();
	server.stop(true);
});

beforeEach(async () => {
	await db.delete(user);
});

const insertUnverifiedUser = async () => {
	const id = crypto.randomUUID();
	const email = `${id}@last-email.test`;
	await db.insert(user).values({
		id,
		name: "Last Email",
		email,
		emailVerified: false,
		createdAt: new Date(),
		updatedAt: new Date(),
	});
	return { id, email };
};

test("the link in the last verification email verifies the user", async () => {
	const { id, email } = await insertUnverifiedUser();
	await auth.api.sendVerificationEmail({ body: { email } });

	const [sent] = await lastEmails({ to: email });
	const link = sent?.links.find((href) => href.includes("/verify-email"));
	if (!link) throw new Error("verification email has no verify link");

	const verifyUrl = new URL(link);
	const res = await fetch(
		new URL(verifyUrl.pathname + verifyUrl.search, base),
		{
			redirect: "manual",
		},
	);
	expect(res.status).toBeLessThan(400);

	const [row] = await db
		.select({ emailVerified: user.emailVerified })
		.from(user)
		.where(eq(user.id, id));
	expect(row?.emailVerified).toBe(true);
});

test("returns the newest matching emails first", async () => {
	const { email } = await insertUnverifiedUser();
	await auth.api.sendVerificationEmail({ body: { email } });
	await auth.api.requestPasswordReset({
		body: { email, redirectTo: "/auth/reset-password" },
	});

	const subjects = async (filter: { subject?: string; count?: number }) =>
		(await lastEmails({ to: email.toUpperCase(), ...filter })).map(
			(sent) => sent.subject,
		);

	expect(await subjects({})).toEqual(["Reset your password"]);
	expect(await subjects({ count: 5 })).toEqual([
		"Reset your password",
		"Verify your email",
	]);
	expect(await subjects({ subject: "verify" })).toEqual(["Verify your email"]);
});
