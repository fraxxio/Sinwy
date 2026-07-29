import { emailClient } from "@backend/infrastructure/email";
import appConfig from "@config";
import db from "@db";
import { checkout, polar, portal, webhooks } from "@polar-sh/better-auth";
import { Polar } from "@polar-sh/sdk";
import { PLAN_SLUGS, type PlanSlug } from "@sinwy/shared";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import {
	APIError,
	createAuthMiddleware,
	getSessionFromCtx,
} from "better-auth/api";
import { organization } from "better-auth/plugins/organization";
import { ensureCheckoutAllowed } from "./checkoutGuard";
import { ResetPasswordEmail } from "./emails/resetPasswordEmail";
import { VerificationEmail } from "./emails/verificationEmail";
import { projectSubscriptionStatus } from "./subscriptionStatus";

// If this client is going to be used elsewhere or new logic specific to polar appears we will move that to it's own module
export const polarClient = new Polar({
	accessToken: appConfig.POLAR_ACCESS_TOKEN,
	server: appConfig.POLAR_SERVER,
});

// keyed by PlanSlug so adding/renaming a plan in @sinwy/shared fails here at compile time
const planProducts = {
	starter: appConfig.POLAR_PRODUCT_STARTER,
	professional: appConfig.POLAR_PRODUCT_PROFESSIONAL,
	enterprise: appConfig.POLAR_PRODUCT_ENTERPRISE,
} satisfies Record<PlanSlug, string>;

export const auth = betterAuth({
	baseURL: appConfig.BETTER_AUTH_URL,
	database: drizzleAdapter(db, {
		provider: "pg",
	}),
	emailAndPassword: {
		enabled: true,
		requireEmailVerification: true,
		revokeSessionsOnPasswordReset: true,
		sendResetPassword: async ({ user, url }) => {
			await emailClient.send({
				to: user.email,
				template: ResetPasswordEmail,
				props: { resetUrl: url },
			});
		},
	},
	emailVerification: {
		autoSignInAfterVerification: true,
		sendVerificationEmail: async ({ user, url }) => {
			await emailClient.send({
				to: user.email,
				template: VerificationEmail,
				props: { verifyUrl: url },
			});
		},
	},
	hooks: {
		// The polar checkout endpoint forwards referenceId into metadata with no
		// ownership check — enforce membership (and no double-purchase) here.
		before: createAuthMiddleware(async (ctx) => {
			if (ctx.path === "/checkout" && ctx.body?.referenceId) {
				const session = await getSessionFromCtx(ctx);
				if (!session) throw new APIError("UNAUTHORIZED");
				await ensureCheckoutAllowed(session.user.id, ctx.body.referenceId);
			}
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
						productId: planProducts[slug],
						slug,
					})),
					successUrl: "/checkout/success?checkout_id={CHECKOUT_ID}",
					authenticatedUsersOnly: true,
				}),
				portal(),
				webhooks({
					secret: appConfig.POLAR_WEBHOOK_SECRET,
					onSubscriptionActive: projectSubscriptionStatus,
					onSubscriptionRevoked: projectSubscriptionStatus,
				}),
			],
		}),
	],
});
