import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { auth } from "@authModule";
import appConfig from "@config";
import type { AuthContext } from "better-auth";
import { testUtils } from "better-auth/plugins";
import { assertLocalDev } from "../assertLocalDev";

const storageStateDir = join(import.meta.dir, "../../../.playwright-cli/auth");

export const loginAs = async (who: { email: string } | { userId: string }) => {
	const ctx = await auth.$context;
	// Better Auth's test login helper, bound to the app's own auth context;
	// init() is typed for default options, so the app's typed context needs widening
	const { test } = testUtils().init(ctx as unknown as AuthContext).context;
	const user =
		"email" in who
			? (await ctx.internalAdapter.findUserByEmail(who.email))?.user
			: await ctx.internalAdapter.findUserById(who.userId);

	if (!user) throw new Error(`No user with ${JSON.stringify(who)}`);
	// sign-in refuses unverified users, so a session for one is a state the app can't reach
	if (!user.emailVerified) {
		throw new Error(`${user.email} has not verified their email`);
	}

	const { session, headers, cookies } = await test.login({
		userId: user.id,
	});
	const cookie = headers.get("cookie") ?? "";

	const check = await auth.api.getSession({ headers: { cookie } });
	if (check?.user.id !== user.id) {
		throw new Error("Better Auth did not accept the new session cookie");
	}

	return {
		userId: user.id,
		email: user.email,
		sessionId: session.id,
		expiresAt: session.expiresAt.toISOString(),
		cookie,
		// the browser talks to the web app, which proxies /api to the backend
		storageState: {
			cookies: cookies.map((c) => ({
				...c,
				domain: new URL(appConfig.WEB_APP_URL).hostname,
				expires: c.expires ?? -1,
			})),
			origins: [],
		},
	};
};

if (import.meta.main) {
	assertLocalDev("create a session");

	const { values } = parseArgs({
		options: {
			email: { type: "string" },
			"user-id": { type: "string" },
			state: { type: "boolean", default: false },
		},
	});

	const who = values.email
		? { email: values.email }
		: values["user-id"]
			? { userId: values["user-id"] }
			: undefined;
	if (!who) {
		console.error(
			"Usage: bun run dev:login-as (--email <email> | --user-id <id>) [--state]",
		);
		process.exit(1);
	}

	const { storageState, ...login } = await loginAs(who).catch(
		(error: Error) => {
			console.error(error.message);
			process.exit(1);
		},
	);
	let storageStateFile: string | undefined;
	if (values.state) {
		await mkdir(storageStateDir, { recursive: true });
		storageStateFile = join(storageStateDir, `${login.userId}.json`);
		await Bun.write(storageStateFile, JSON.stringify(storageState, null, "\t"));
	}

	console.log(JSON.stringify({ ...login, storageStateFile }, null, "\t"));
	process.exit(0);
}
