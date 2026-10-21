import { parseArgs } from "node:util";
import { auth } from "@authModule";
import appConfig from "@config";
import {
	type ApiResponse,
	DEFAULT_ORGANIZATION_INDUSTRY,
	type OrganizationDto,
	type OrganizationStatus,
} from "@sinwy/shared";
import { assertLocalDev } from "../assertLocalDev";
import { lastEmails } from "./lastEmail";
import { buildPolarDelivery, sendPolarDelivery } from "./simulatePolarWebhook";

export const scenarios = [
	"user",
	"owner-with-org",
	"subscribed-org",
	"org-with-staff",
] as const;
export type Scenario = (typeof scenarios)[number];

const isScenario = (value: string): value is Scenario =>
	(scenarios as readonly string[]).includes(value);

export type SeedOptions = {
	scenario: Scenario;
	baseUrl: string | URL;
	emailBase: string;
	staffCount?: number;
};

/** Calls the backend the way the web app does: JSON, the web app's origin and the user's cookie. */
const call = async <T>(
	baseUrl: string | URL,
	method: string,
	path: string,
	{ cookie, body }: { cookie?: string; body?: unknown } = {},
): Promise<T> => {
	const res = await fetch(new URL(path, baseUrl), {
		method,
		headers: {
			origin: new URL(appConfig.WEB_APP_URL).origin,
			...(body !== undefined && { "content-type": "application/json" }),
			...(cookie && { cookie }),
		},
		...(body !== undefined && { body: JSON.stringify(body) }),
	});
	const text = await res.text();
	if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text}`);
	return JSON.parse(text) as T;
};

const callApp = async <T>(...args: Parameters<typeof call>) => {
	const json = await call<ApiResponse<T>>(...args);
	if (!json.isSuccess) throw new Error(json.message);
	return json.data;
};

const verificationLink = async (email: string) => {
	// the backend may still be writing the email when sign-up responds
	for (let attempt = 0; attempt < 50; attempt++) {
		const [verification] = await lastEmails({
			to: email,
			subject: "Verify your email",
		});
		const link = verification?.links.find((href) =>
			href.includes("/verify-email"),
		);
		if (link) return link;
		await Bun.sleep(100);
	}
	throw new Error(
		`No verification email for ${email}. Is the backend running with EMAIL_DRIVER=console?`,
	);
};

/** The sign-up form, then a click on the emailed link, which verifies and signs the user in. */
const signUp = async (
	baseUrl: string | URL,
	email: string,
	name: string,
	password: string,
) => {
	const { user } = await call<{ user: { id: string } }>(
		baseUrl,
		"POST",
		"/api/auth/sign-up/email",
		{ body: { name, email, password, callbackURL: "/auth/postlogin" } },
	);

	// the link points at the web app, which proxies /api to the backend
	const { pathname, search } = new URL(await verificationLink(email));
	const res = await fetch(new URL(pathname + search, baseUrl), {
		redirect: "manual",
	});
	const cookie = res.headers
		.getSetCookie()
		.flatMap((setCookie) => setCookie.split(";", 1))
		.join("; ");
	if (res.status !== 302 || !cookie) {
		throw new Error(
			`Verifying ${email} failed: ${res.status} ${await res.text()}`,
		);
	}
	return { userId: user.id, email, cookie };
};

const statusPath = (organizationId: string) =>
	`/api/organizations/${organizationId}/status`;

const activate = async (
	baseUrl: string | URL,
	organizationId: string,
	cookie: string,
) => {
	const delivery = buildPolarDelivery({
		type: "subscription.active",
		organizationId,
	});
	const { status, response } = await sendPolarDelivery(baseUrl, delivery);
	if (status !== 200) {
		throw new Error(`subscription.active webhook → ${status} ${response}`);
	}

	// the endpoint answers 200 for events it ignores, so check the outcome
	const org = await callApp<{ status: OrganizationStatus }>(
		baseUrl,
		"GET",
		statusPath(organizationId),
		{ cookie },
	);
	if (org.status !== "active") {
		throw new Error(`Webhook accepted, but ${organizationId} is ${org.status}`);
	}
	return delivery.subscriptionId;
};

const completeOnboarding = async (
	baseUrl: string | URL,
	organizationId: string,
	cookie: string,
	contactEmail: string,
) => {
	await callApp(
		baseUrl,
		"PUT",
		`/api/organizations/${organizationId}/profile`,
		{
			cookie,
			body: {
				tagline: "Seeded for local testing",
				description: "Created by bun run dev:seed-scenario.",
				email: contactEmail,
				phone: "+370 600 00000",
				website: "",
				city: "Vilnius",
				country: "LT",
			},
		},
	);
	await callApp(
		baseUrl,
		"POST",
		`/api/organizations/${organizationId}/onboarding/complete`,
		{ cookie },
	);
};

/**
 * Creates fresh users and an organization through the backend's HTTP API.
 * The org becomes active through a simulated Polar webhook, never by writing
 * its status.
 */
export const seedScenario = async ({
	scenario,
	baseUrl,
	emailBase,
	staffCount = 1,
}: SeedOptions) => {
	const runId = crypto.randomUUID().slice(0, 8);
	const [local, domain] = emailBase.split("@");
	const emailFor = (label: string) =>
		`${local}+seed-${runId}-${label}@${domain}`;
	const password = `Seed-${runId}-1`;

	if (scenario === "user") {
		const { userId, email } = await signUp(
			baseUrl,
			emailFor("user"),
			"Seed User",
			password,
		);
		return { scenario, password, users: [{ role: "user", userId, email }] };
	}

	const owner = await signUp(
		baseUrl,
		emailFor("owner"),
		"Seed Owner",
		password,
	);
	const users = [{ role: "owner", userId: owner.userId, email: owner.email }];

	const org = await callApp<OrganizationDto>(
		baseUrl,
		"POST",
		"/api/organizations",
		{
			cookie: owner.cookie,
			body: { name: `Seed ${runId}`, industry: DEFAULT_ORGANIZATION_INDUSTRY },
		},
	);

	if (scenario === "owner-with-org") {
		return { scenario, password, organization: org, users };
	}

	const subscriptionId = await activate(baseUrl, org.id, owner.cookie);
	await completeOnboarding(baseUrl, org.id, owner.cookie, owner.email);

	if (scenario === "org-with-staff") {
		for (let n = 1; n <= staffCount; n++) {
			const staff = await signUp(
				baseUrl,
				emailFor(`staff${n}`),
				"Seed Staff",
				password,
			);
			// there is no invite flow yet, so this is Better Auth's server-side add
			await auth.api.addMember({
				body: { userId: staff.userId, organizationId: org.id, role: "staff" },
			});
			await callApp(baseUrl, "GET", statusPath(org.id), {
				cookie: staff.cookie,
			});
			users.push({ role: "staff", userId: staff.userId, email: staff.email });
		}
	}

	return {
		scenario,
		password,
		organization: {
			...org,
			status: "active",
			subscriptionId,
			onboardingCompleted: true,
		},
		users,
	};
};

if (import.meta.main) {
	assertLocalDev("seed data");

	const { values, positionals } = parseArgs({
		allowPositionals: true,
		options: {
			staff: { type: "string", default: "1" },
			url: { type: "string", default: `http://localhost:${appConfig.PORT}` },
		},
	});

	const scenario = positionals[0] ?? "";
	const staffCount = Number(values.staff);
	if (
		!isScenario(scenario) ||
		!Number.isInteger(staffCount) ||
		staffCount < 1
	) {
		console.error(
			`Usage: bun run dev:seed-scenario <${scenarios.join("|")}> [--staff <n>] [--url <backend url>]`,
		);
		process.exit(1);
	}

	const emailBase = appConfig.SEED_EMAIL_BASE;
	if (!emailBase) {
		console.error(
			"Set SEED_EMAIL_BASE in Sinwy.Backend/.env to an address on a domain that receives mail (Polar rejects the rest); users get plus-aliases of it.",
		);
		process.exit(1);
	}

	// fail before creating anything when the backend isn't up
	await fetch(values.url).catch(() => {
		console.error(
			`No backend at ${values.url}. Start it with bun run start:server`,
		);
		process.exit(1);
	});

	const result = await seedScenario({
		scenario,
		baseUrl: values.url,
		emailBase,
		staffCount,
	}).catch((error: Error) => {
		console.error(error.message);
		process.exit(1);
	});

	console.log(JSON.stringify(result, null, "\t"));
	process.exit(0);
}
