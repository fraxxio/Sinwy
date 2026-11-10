import { expect, it } from "bun:test";
import {
	canManageMember,
	seatUsage,
	type TeamInvitation,
	type TeamMember,
} from "#/modules/org-dashboard/lib/team";

const now = new Date("2026-11-10T12:00:00Z");

const member = (
	userId: string,
	role: TeamMember["role"] = "staff",
): TeamMember => ({
	id: `member-${userId}`,
	userId,
	name: userId,
	email: `${userId}@example.com`,
	role,
	joinedAt: "2026-01-01T00:00:00.000Z",
});

const invitation = (expiresAt: string, status = "pending"): TeamInvitation => ({
	id: expiresAt,
	email: "new@example.com",
	role: "staff",
	status,
	expiresAt,
});

it("counts members and unexpired pending invitations against the plan", () => {
	const usage = seatUsage(
		[member("owner", "owner"), member("staff")],
		[
			invitation("2026-11-12T00:00:00Z"),
			invitation("2026-11-10T11:59:59Z"),
			invitation("2026-11-12T00:00:00Z", "canceled"),
			invitation("2026-11-12T00:00:00Z", "accepted"),
		],
		"starter",
		now,
	);

	expect(usage).toEqual({ used: 3, limit: 3, full: true });
});

it("leaves seats free below the cap and none without a plan", () => {
	expect(seatUsage([member("owner", "owner")], [], "starter", now)).toEqual({
		used: 1,
		limit: 3,
		full: false,
	});
	expect(seatUsage([member("owner", "owner")], [], null, now).full).toBe(true);
});

it("is full when a downgrade left the organization over its cap", () => {
	const members = ["a", "b", "c", "d"].map((id) => member(id));
	expect(seatUsage(members, [], "starter", now).full).toBe(true);
});

it("hides row actions on the owner and on the current user", () => {
	expect(canManageMember(member("boss", "owner"), "me")).toBe(false);
	expect(canManageMember(member("me", "admin"), "me")).toBe(false);
	expect(canManageMember(member("other", "admin"), "me")).toBe(true);
	expect(canManageMember(member("other", "staff"), "me")).toBe(true);
});
