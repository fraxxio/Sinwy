import { emailClient } from "@backend/infrastructure/email";
import { polarClient, productIdFor } from "@backend/infrastructure/polar";
import { applySubscriptionEvent, ensureCheckoutAllowed } from "@billingModule";
import appConfig from "@config";
import db from "@db";
import { createLogger } from "@logger";
import { deleteSoleOwnedOrganizations } from "@organizationsModule";
import { checkout, polar, portal, webhooks } from "@polar-sh/better-auth";
import {
	ac,
	orgAccessRoles,
	PLAN_SLUGS,
	profileSchema,
	RESEND_COOLDOWN_SECONDS,
} from "@sinwy/shared";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import {
	APIError,
	createAuthMiddleware,
	getSessionFromCtx,
} from "better-auth/api";
import { organization } from "better-auth/plugins/organization";
import { z } from "zod";
import { cleanupDeletedUser } from "./deletedUserCleanup";
import { ChangeEmailConfirmationEmail } from "./emails/changeEmailConfirmationEmail";
import { DeleteAccountEmail } from "./emails/deleteAccountEmail";
import { ResetPasswordEmail } from "./emails/resetPasswordEmail";
import { VerificationEmail } from "./emails/verificationEmail";

const authLogger = createLogger("auth");

// better-auth only type-checks name; apply the shared length/character rule
const validName = (name: unknown) => {
	const result = profileSchema.safeParse({ name });
	if (!result.success) {
		throw new APIError("BAD_REQUEST", { message: "Invalid name" });
	}
	return result.data.name;
};

export const auth = betterAuth({
	baseURL: appConfig.BETTER_AUTH_URL,
	logger: {
		level: appConfig.LOG_LEVEL,
		log: (level, message, ...args) => {
			authLogger[level](message, args.length > 0 ? { args } : undefined);
		},
	},
	database: drizzleAdapter(db, {
		provider: "pg",
	}),
	emailAndPassword: {
		enabled: true,
		requireEmailVerification: true,
		revokeSessionsOnPasswordReset: true,
		onExistingUserSignUp: async ({ user }, request) => {
			if (user.emailVerified) return;
			const { callbackURL } = z
				.object({ callbackURL: z.string() })
				.catch({ callbackURL: "/auth/postlogin" })
				.parse(await request?.json().catch(() => null));
			await auth.api.sendVerificationEmail({
				body: { email: user.email, callbackURL },
			});
		},
		sendResetPassword: async ({ user, url }) => {
			await emailClient.send({
				to: user.email,
				template: ResetPasswordEmail,
				props: { resetUrl: url },
			});
		},
	},
	rateLimit: {
		customRules: {
			"/send-verification-email": { window: RESEND_COOLDOWN_SECONDS, max: 3 },
			"/change-email": { window: 60, max: 3 },
			"/delete-user": { window: 60, max: 3 },
		},
	},
	user: {
		changeEmail: {
			enabled: true,
			sendChangeEmailConfirmation: async ({ user, newEmail, url }) => {
				await emailClient.send({
					to: user.email,
					template: ChangeEmailConfirmationEmail,
					props: { newEmail, confirmUrl: url },
				});
			},
		},
		deleteUser: {
			enabled: true,
			sendDeleteAccountVerification: async ({ user, url }) => {
				await emailClient.send({
					to: user.email,
					template: DeleteAccountEmail,
					props: { deleteUrl: url },
				});
			},
			// only reached from the emailed link, so a failure must land on a page, not JSON
			beforeDelete: async (user) => {
				try {
					await deleteSoleOwnedOrganizations(user.id);
				} catch (error) {
					if (!(error instanceof APIError)) throw error;
					throw new APIError("FOUND", undefined, {
						location: new URL(
							"/auth/goodbye?error=SUBSCRIPTION_REVOKE_FAILED",
							appConfig.WEB_APP_URL,
						).toString(),
					});
				}
			},
			afterDelete: async (user) => {
				await cleanupDeletedUser(user);
			},
		},
	},
	databaseHooks: {
		user: {
			create: {
				// social sign-ups keep whatever the provider sends; only our own form is held to the rule
				before: (data, ctx) => {
					if (ctx?.path !== "/sign-up/email") return Promise.resolve();
					return Promise.resolve({
						data: { ...data, name: validName(data.name) },
					});
				},
			},
			update: {
				before: (data) => {
					if (data.name === undefined) return Promise.resolve();
					return Promise.resolve({
						data: { ...data, name: validName(data.name) },
					});
				},
			},
		},
	},
	emailVerification: {
		autoSignInAfterVerification: true,
		sendOnSignIn: true,
		sendVerificationEmail: async ({ user, url }) => {
			await emailClient.send({
				to: user.email,
				template: VerificationEmail,
				props: { verifyUrl: url },
			});
		},
	},
	hooks: {
		// The polar plugin trusts referenceId with no membership check. Checkout
		// is guarded here; the org-scoped subscription read is ours instead
		// (GET /api/organizations/:organizationId/subscription).
		before: createAuthMiddleware(async (ctx) => {
			if (ctx.path === "/checkout" && ctx.body?.referenceId) {
				const session = await getSessionFromCtx(ctx);
				if (!session) throw new APIError("UNAUTHORIZED");
				await ensureCheckoutAllowed(session.user.id, ctx.body.referenceId);
			}
			if (
				ctx.path === "/customer/subscriptions/list" &&
				ctx.query?.["referenceId"]
			)
				throw new APIError("FORBIDDEN", {
					message: "Read organization subscriptions through the organization",
				});
		}),
	},
	socialProviders: {
		google: {
			clientId: appConfig.GOOGLE_CLIENT_ID,
			clientSecret: appConfig.GOOGLE_CLIENT_SECRET,
		},
	},
	plugins: [
		organization({
			ac,
			roles: orgAccessRoles,
			// creation goes through POST /api/organizations only
			allowUserToCreateOrganization: false,
			schema: {
				organization: {
					additionalFields: {
						status: {
							type: "string",
							defaultValue: "inactive",
							input: false,
						},
						plan: {
							type: "string",
							required: false,
							input: false,
						},
						industry: {
							type: "string",
							defaultValue: "other",
							required: false,
						},
						onboardingCompletedAt: {
							type: "date",
							required: false,
							input: false,
						},
					},
				},
			},
		}),
		polar({
			client: polarClient,
			createCustomerOnSignUp: true,
			use: [
				checkout({
					products: PLAN_SLUGS.map((slug) => ({
						productId: productIdFor(slug),
						slug,
					})),
					successUrl: new URL(
						"/checkout/success?checkout_id={CHECKOUT_ID}",
						appConfig.WEB_APP_URL,
					).toString(),
					authenticatedUsersOnly: true,
				}),
				portal(),
				webhooks({
					secret: appConfig.POLAR_WEBHOOK_SECRET,
					// `updated` fires on every change (plan change, cancel, renewal);
					// all events converge on the same projection
					onSubscriptionUpdated: applySubscriptionEvent,
					onSubscriptionActive: applySubscriptionEvent,
					onSubscriptionRevoked: applySubscriptionEvent,
				}),
			],
		}),
	],
});
