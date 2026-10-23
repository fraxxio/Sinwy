import { polarClient } from "@polar-sh/better-auth/client";
import { ac, orgAccessRoles } from "@sinwy/shared";
import { organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

// @polar-sh/better-auth 2.1 types its only client action (checkoutEmbed, which
// we don't use) against a BetterFetch that better-auth 1.7 rejects; the server
// endpoints still type through $InferServerPlugin
const polar = polarClient() as Omit<
	ReturnType<typeof polarClient>,
	"getActions"
>;

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
		polar,
	],
});
