import appConfig from "@config";
import db from "@db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins/organization";
import { sendEmail } from "./email";

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
			await sendEmail({
				to: user.email,
				subject: "Verify your email",
				html: `<p>Click <a href="${url}">here</a> to verify your email.</p>`,
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
