import { polarClient } from "@polar-sh/better-auth";
import { ac, orgAccessRoles } from "@sinwy/shared";
import { organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
	plugins: [
		organizationClient({
			// same access controller as the backend plugin so role arguments
			// on invite/update calls are typed from one source
			ac,
			roles: orgAccessRoles,
			// mirrors the organization plugin schema in
			// Sinwy.Backend/modules/auth/auth.ts so list() and setActive() type
			// our own columns; there is no compile-time link between the two
			schema: {
				organization: {
					additionalFields: {
						status: { type: "string", input: false, required: true },
						plan: { type: "string", input: false, required: false },
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
