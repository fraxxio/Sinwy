import { expect, it, mock } from "bun:test";
import type { InvitationPreviewDto } from "@sinwy/shared";
import { acceptInvite, inviteView } from "../lib/invite";

const preview: InvitationPreviewDto = {
	status: "pending",
	organization: { name: "Bloom Studio", slug: "bloom" },
	inviterName: "Ada",
	role: "staff",
	email: "Sam@Example.com",
	expiresAt: "2026-11-17T00:00:00.000Z",
};

const accepted = () =>
	mock(async () => ({
		data: { member: { organizationId: "org_1" } },
		error: null,
	}));

it("picks the view from the preview and the signed-in email", () => {
	expect(inviteView(null, "sam@example.com")).toBe("unavailable");
	expect(inviteView({ ...preview, status: "expired" }, undefined)).toBe(
		"expired",
	);
	expect(inviteView(preview, undefined)).toBe("signed-out");
	expect(inviteView(preview, "other@example.com")).toBe("mismatch");
	expect(inviteView(preview, "sam@example.com")).toBe("ready");
});

it("never calls the endpoint for a mismatched, signed-out or dead invite", async () => {
	const accept = accepted();
	for (const [p, email] of [
		[preview, "other@example.com"],
		[preview, undefined],
		[{ ...preview, status: "expired" as const }, "sam@example.com"],
		[null, "sam@example.com"],
	] as const) {
		expect((await acceptInvite("inv_1", p, email, accept)).ok).toBe(false);
	}
	expect(accept).not.toHaveBeenCalled();
});

it("accepts as the invited email, whatever its case", async () => {
	const accept = accepted();
	expect(
		await acceptInvite("inv_1", preview, "sam@example.com", accept),
	).toEqual({ ok: true, organizationId: "org_1" });
	expect(accept).toHaveBeenCalledWith({ invitationId: "inv_1" });
});

it("explains a full organization instead of a generic error", async () => {
	const accept = mock(async () => ({
		data: null,
		error: {
			code: "ORGANIZATION_MEMBERSHIP_LIMIT_REACHED",
			message: "limit",
			status: 403,
		},
	}));
	const outcome = await acceptInvite(
		"inv_1",
		preview,
		"sam@example.com",
		accept,
	);
	expect(outcome).toEqual({
		ok: false,
		message:
			"Bloom Studio has no free seats right now. Ask Ada to free one up, then try again.",
	});
});
