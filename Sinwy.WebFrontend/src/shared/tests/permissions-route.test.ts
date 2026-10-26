import { beforeEach, expect, it } from "bun:test";
import type { OrgRole } from "@sinwy/shared";
import { isRedirect } from "@tanstack/react-router";
import { takeAccessDenied } from "../lib/auth/access-denied";
import { requirePermission } from "../lib/auth/protected-route";

const routeArgs = (roles: OrgRole[], preload = false) => ({
	context: { organization: { slug: "acme" }, member: { roles } },
	preload,
});

const guard = requirePermission("people:manage");

const thrownBy = (run: () => unknown) => {
	try {
		run();
	} catch (error) {
		return error;
	}
	return undefined;
};

beforeEach(() => {
	takeAccessDenied();
});

it("lets an owner through without raising a notice", () => {
	expect(guard(routeArgs(["owner"]))).toBeUndefined();
	expect(takeAccessDenied()).toBeNull();
});

it("redirects staff to the organization overview", () => {
	const thrown = thrownBy(() => guard(routeArgs(["staff"])));

	expect(isRedirect(thrown)).toBe(true);
	expect(isRedirect(thrown) && thrown.options).toMatchObject({
		to: "/$organizationSlug",
		params: { organizationSlug: "acme" },
	});
	expect(takeAccessDenied()).toBe("You don't have access to that page");
});

it("passes on the union of several roles", () => {
	expect(guard(routeArgs(["staff", "admin"]))).toBeUndefined();
});

it("denies a member with no recognised role", () => {
	expect(isRedirect(thrownBy(() => guard(routeArgs([]))))).toBe(true);
});

it("stays silent when denying a preload", () => {
	expect(isRedirect(thrownBy(() => guard(routeArgs(["staff"], true))))).toBe(
		true,
	);
	expect(takeAccessDenied()).toBeNull();
});
