import { emailClient } from "@backend/infrastructure/email";
import appConfig from "@config";
import db from "@db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins/organization";
import { VerificationEmail } from "./emails/verificationEmail";

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
	],
});
