import { polarClient } from "@polar-sh/better-auth";
import { organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
	plugins: [
		organizationClient({
			// mirrors the backend organization plugin schema so list() and
			// setActive() type our own columns
			schema: {
				organization: {
					additionalFields: {
						status: { type: "string", input: false, required: true },
						industry: { type: "string", required: true },
						onboardingCompletedAt: {
							type: "date",
							input: false,
							required: false,
						},
					},
				},
			},
		}),
		polarClient(),
	],
});
