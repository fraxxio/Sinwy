import { emailClient } from "@backend/infrastructure/email";
import { polarCore, productIdFor } from "@backend/infrastructure/polar";
import {
	applySubscriptionEvent,
	ensureCheckoutAllowed,
	revokeAccountSubscriptions,
} from "@billingModule";
import appConfig from "@config";
import db from "@db";
import { createLogger } from "@logger";
import { scheduleOwnedOrganizationsForDeletion } from "@organizationsModule";
import { checkout, polar, portal, webhooks } from "@polar-sh/better-auth";
import {
	ac,
	orgAccessRoles,
	PLAN_SLUGS,
	profileSchema,
	RESEND_COOLDOWN_SECONDS,
} from "@sinwy/shared";
import {
	cancelTransfersToMember,
	findTransferAwaitingCheckout,
} from "@transfersModule";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import {
	APIError,
	createAuthMiddleware,
	getSessionFromCtx,
} from "better-auth/api";
import { organization } from "better-auth/plugins/organization";
import { z } from "zod";
import {
	refuseOrganizationEndpoint,
	refuseScheduledOrganization,
	refuseUnavailableOrganization,
} from "./activeOrganization";
import { cleanupDeletedUser } from "./deletedUserCleanup";
import { ChangeEmailConfirmationEmail } from "./emails/changeEmailConfirmationEmail";
import { DeleteAccountEmail } from "./emails/deleteAccountEmail";
import { ResetPasswordEmail } from "./emails/resetPasswordEmail";
import { VerificationEmail } from "./emails/verificationEmail";
import { refuseOwnerRole } from "./singleOwner";

const authLogger = createLogger("auth");

// better-auth only type-checks name; apply the shared length/character rule
const validName = (name: unknown) => {
	const result = profileSchema.safeParse({ name });
	if (!result.success) {
		throw new APIError("BAD_REQUEST", { message: "Invalid name" });
	}
	return result.data.name;
};

// The plugin forwards the rest of the body to Polar (metadata, raw product
// ids, trials, discounts, redirect URLs). The plan is the user's own, so no
// reference_id either.
const checkoutBodySchema = z.strictObject({
	slug: z.enum(PLAN_SLUGS),
	redirect: z.boolean().optional(),
	transferId: z.string().min(1).optional(),
});

const checkoutSuccessUrl = (query: string) =>
	new URL(
		`/checkout/success?checkout_id={CHECKOUT_ID}${query}`,
		appConfig.WEB_APP_URL,
	).toString();

/**
 * A plan bought to take over an organization names the transfer in its
 * metadata, which Polar copies onto the subscription; the projection then
 * completes the transfer.
 */
const transferCheckoutFields = async (userId: string, transferId: string) => {
	const transfer = await findTransferAwaitingCheckout(userId, transferId);
	if (!transfer)
		throw new APIError("BAD_REQUEST", {
			message: "This offer is no longer open",
		});
	return {
		metadata: { transferId },
		success_url: checkoutSuccessUrl(
			`&organization=${encodeURIComponent(transfer.organizationId)}`,
		),
	};
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
					await revokeAccountSubscriptions(user.id);
				} catch (error) {
					if (!(error instanceof APIError)) throw error;
					throw new APIError("FOUND", undefined, {
						location: new URL(
							"/auth/goodbye?error=SUBSCRIPTION_REVOKE_FAILED",
							appConfig.WEB_APP_URL,
						).toString(),
					});
				}
				await scheduleOwnedOrganizationsForDeletion(user.id);
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
		// The polar plugin trusts referenceId with no membership check, so it is
		// refused here; the subscription read is ours (GET /api/account/subscription).
		before: createAuthMiddleware(async (ctx) => {
			if (ctx.path === "/checkout") {
				const body = checkoutBodySchema.safeParse(ctx.body);
				if (!body.success)
					throw new APIError("BAD_REQUEST", {
						message: "Invalid checkout request",
					});
				const session = await getSessionFromCtx(ctx);
				if (!session) throw new APIError("UNAUTHORIZED");
				const { transferId, ...rest } = body.data;
				const { allowTrial } = await ensureCheckoutAllowed(session.user.id);
				return {
					context: {
						body: {
							...rest,
							...(transferId
								? await transferCheckoutFields(session.user.id, transferId)
								: {}),
							// one trial per user: the plugin passes allow_trial on to Polar
							...(!allowTrial && { allow_trial: false }),
						},
					},
				};
			}
			if (ctx.path.startsWith("/organization/")) {
				const session = await getSessionFromCtx(ctx);
				// the plugin has no beforeSetActive hook
				if (session && ctx.path === "/organization/set-active")
					await refuseUnavailableOrganization(session.session, ctx.body);
				else if (session)
					await refuseOrganizationEndpoint(ctx.path, session.session, ctx);
			}
			if (
				ctx.path === "/customer/subscriptions/list" &&
				ctx.query?.["reference_id"]
			)
				throw new APIError("FORBIDDEN", {
					message: "Read your subscription through your account",
				});
			return undefined;
		}),
		// leaving fires no afterRemoveMember; the cancel is a no-op unless the user left
		after: createAuthMiddleware(async (ctx) => {
			if (ctx.path !== "/organization/leave") return;
			const body = z.object({ organizationId: z.string() }).safeParse(ctx.body);
			const session = await getSessionFromCtx(ctx);
			if (body.success && session)
				await cancelTransfersToMember(
					body.data.organizationId,
					session.user.id,
				);
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
			// the plugin already keeps the only owner from leaving, being removed
			// or demoted; these keep a second owner from ever appearing
			organizationHooks: {
				beforeCreateInvitation: async ({ invitation }) => {
					refuseOwnerRole(invitation.role);
					await refuseScheduledOrganization(invitation.organizationId);
				},
				beforeAcceptInvitation: async ({ invitation }) => {
					refuseOwnerRole(invitation.role);
					await refuseScheduledOrganization(invitation.organizationId);
				},
				beforeUpdateMemberRole: async ({ member, newRole }) =>
					refuseOwnerRole(member.role, newRole),
				afterRemoveMember: ({ member }) =>
					cancelTransfersToMember(member.organizationId, member.userId),
			},
			schema: {
				organization: {
					additionalFields: {
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
						deletionScheduledAt: {
							type: "date",
							required: false,
							input: false,
						},
						slotHeldAt: {
							type: "date",
							required: false,
							input: false,
						},
					},
				},
			},
		}),
		polar({
			client: polarCore,
			// also deletes the customer on user delete, anonymized by `polarCore`
			createCustomerOnSignUp: true,
			use: [
				checkout({
					products: PLAN_SLUGS.map((slug) => ({
						productId: productIdFor(slug),
						slug,
					})),
					successUrl: checkoutSuccessUrl(""),
					authenticatedUsersOnly: true,
				}),
				// the portal spans all of a user's organizations, so return to the
				// post-login router rather than one organization's billing page
				portal({
					returnUrl: new URL(
						"/auth/postlogin",
						appConfig.WEB_APP_URL,
					).toString(),
				}),
				webhooks({
					secret: appConfig.POLAR_WEBHOOK_SECRET,
					// `updated` fires on every change (plan change, cancel, renewal);
					// all events converge on the same projection. Wrapped because
					// billing's routes import auth: a bare reference is read mid-cycle.
					onSubscriptionUpdated: (event) => applySubscriptionEvent(event),
					onSubscriptionActive: (event) => applySubscriptionEvent(event),
					onSubscriptionRevoked: (event) => applySubscriptionEvent(event),
				}),
			],
		}),
	],
});
