import { API_ERROR_CODES, type ApiResponse } from "@sinwy/shared";
import type { QueryClient } from "@tanstack/react-query";
import type { AnyRouter } from "@tanstack/react-router";
import { toast } from "#/shared/components/ui/toast";
import { invalidateOrganizations } from "#/shared/lib/organizations";

const TOAST_ID = "organization-inactive";

/**
 * Backstop for org-shell mutations: the plan can be revoked mid-session, so a
 * write the UI still allowed is refused. Tells the user and re-runs the shell's
 * `beforeLoad` on a fresh organization list, which takes them out of the
 * organization. Returns whether it handled the response.
 */
export function handleOrganizationInactive(
	res: ApiResponse<unknown>,
	router: Pick<AnyRouter, "invalidate">,
	queryClient: QueryClient,
) {
	if (res.isSuccess || res.code !== API_ERROR_CODES.ORGANIZATION_INACTIVE)
		return false;
	toast.add({
		id: TOAST_ID,
		type: "error",
		title: "This organization has no active plan",
		description: "It can't be opened until its plan is renewed.",
		timeout: 6_000,
	});
	void invalidateOrganizations(queryClient).then(() => router.invalidate());
	return true;
}
