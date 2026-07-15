import { polarClient } from "@polar-sh/better-auth";
import { organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
	plugins: [
		organizationClient({
			// mirrors the backend organization plugin schema so list() types `status`
			schema: {
				organization: {
					additionalFields: {
						status: { type: "string", input: false, required: true },
					},
				},
			},
		}),
		polarClient(),
	],
});
