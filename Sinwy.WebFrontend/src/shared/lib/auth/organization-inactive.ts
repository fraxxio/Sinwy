import type { ApiResponse } from "@sinwy/shared";
import type { AnyRouter } from "@tanstack/react-router";
import { toast } from "#/shared/components/ui/toast";
import { isOrganizationInactive } from "#/shared/lib/auth/read-only";

const TOAST_ID = "organization-inactive";

/**
 * Backstop for org-shell mutations: the plan can be revoked mid-session, so a
 * write the UI still allowed is refused. Tells the user and re-runs the shell's
 * `beforeLoad` so the inactive banner and read-only mode kick in. Returns
 * whether it handled the response.
 */
export function handleOrganizationInactive(
	res: ApiResponse<unknown>,
	router: Pick<AnyRouter, "invalidate">,
) {
	if (!isOrganizationInactive(res)) return false;
	toast.add({
		id: TOAST_ID,
		type: "error",
		title: "This organization has no active plan",
		description: "Changes are paused until the plan is renewed.",
		timeout: 6_000,
	});
	void router.invalidate();
	return true;
}
