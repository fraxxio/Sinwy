import { emailClient } from "@backend/infrastructure/email";
import appConfig from "@config";
import db from "@db";
import { checkout, polar, portal, webhooks } from "@polar-sh/better-auth";
import { Polar } from "@polar-sh/sdk";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins/organization";
import { VerificationEmail } from "./emails/verificationEmail";
import { projectSubscriptionStatus } from "./subscriptionStatus";

const polarClient = new Polar({
	accessToken: appConfig.POLAR_ACCESS_TOKEN,
	server: appConfig.POLAR_SERVER,
});

export const auth = betterAuth({
	baseURL: appConfig.BETTER_AUTH_URL,
	database: drizzleAdapter(db, {
		provider: "pg",
	}),
	emailAndPassword: {
		enabled: true,
		requireEmailVerification: true,
	},
	emailVerification: {
		sendVerificationEmail: async ({ user, url }) => {
			await emailClient.send({
				to: user.email,
				template: VerificationEmail,
				props: { verifyUrl: url },
			});
		},
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
					products: [
						{
							productId: appConfig.POLAR_PRODUCT_STARTER,
							slug: "starter",
						},
						{
							productId: appConfig.POLAR_PRODUCT_PROFESSIONAL,
							slug: "professional",
						},
						{
							productId: appConfig.POLAR_PRODUCT_ENTERPRISE,
							slug: "enterprise",
						},
					],
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
