import type { InvitationPreviewDto } from "@sinwy/shared";
import { queryOptions } from "@tanstack/react-query";
import { api } from "#/shared/lib/api";
import { authErrorMessage } from "#/shared/lib/auth/auth-error";

/** null when the invite can't be shown: unknown, canceled, answered, or the organization is closing. */
export const invitationPreviewQuery = (invitationId: string) =>
	queryOptions({
		queryKey: ["invitations", invitationId, "preview"],
		queryFn: async () => {
			const res = await api<InvitationPreviewDto>(
				`/public/invitations/${encodeURIComponent(invitationId)}`,
			);
			if (res.isSuccess) return res.data;
			if (res.code === 404) return null;
			throw new Error(res.message);
		},
	});

export type InviteView =
	| "unavailable"
	| "expired"
	| "signed-out"
	| "mismatch"
	| "ready";

export const inviteView = (
	preview: InvitationPreviewDto | null,
	sessionEmail: string | undefined,
): InviteView => {
	if (!preview) return "unavailable";
	if (preview.status === "expired") return "expired";
	if (sessionEmail === undefined) return "signed-out";
	return sessionEmail.toLowerCase() === preview.email.toLowerCase()
		? "ready"
		: "mismatch";
};

type AuthResult<T> = {
	data: T | null;
	error: {
		code?: string | undefined;
		message?: string | undefined;
		status?: number | undefined;
	} | null;
};

type AcceptInvitation = (body: {
	invitationId: string;
}) => Promise<AuthResult<{ member: { organizationId: string } }>>;

export type AcceptOutcome =
	| { ok: true; organizationId: string }
	| { ok: false; message: string };

const MEMBERSHIP_LIMIT_REACHED = "ORGANIZATION_MEMBERSHIP_LIMIT_REACHED";

/** Accepts only as the invited email; anyone else never reaches the endpoint. */
export async function acceptInvite(
	invitationId: string,
	preview: InvitationPreviewDto | null,
	sessionEmail: string | undefined,
	accept: AcceptInvitation,
): Promise<AcceptOutcome> {
	if (inviteView(preview, sessionEmail) !== "ready" || !preview)
		return { ok: false, message: "This invite isn't for this account." };
	const { data, error } = await accept({ invitationId });
	if (error?.code === MEMBERSHIP_LIMIT_REACHED)
		return {
			ok: false,
			message: `${preview.organization.name} has no free seats right now. Ask ${preview.inviterName} to free one up, then try again.`,
		};
	if (error || !data)
		return { ok: false, message: authErrorMessage(error ?? {}) };
	return { ok: true, organizationId: data.member.organizationId };
}
