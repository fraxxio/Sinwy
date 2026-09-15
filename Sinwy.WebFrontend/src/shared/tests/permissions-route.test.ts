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

beforeEach(() => {
	takeAccessDenied();
});

it("lets an owner through without raising a notice", () => {
	expect(guard(routeArgs(["owner"]))).toBeUndefined();
	expect(takeAccessDenied()).toBe(false);
});

it("redirects staff to the organization overview", () => {
	let thrown: unknown;
	try {
		guard(routeArgs(["staff"]));
	} catch (error) {
		thrown = error;
	}

	expect(isRedirect(thrown)).toBe(true);
	expect(isRedirect(thrown) && thrown.options).toMatchObject({
		to: "/$organizationSlug",
		params: { organizationSlug: "acme" },
	});
	expect(takeAccessDenied()).toBe(true);
});

it("passes on the union of several roles", () => {
	expect(guard(routeArgs(["staff", "admin"]))).toBeUndefined();
});

it("denies a member with no recognised role", () => {
	expect(() => guard(routeArgs([]))).toThrow();
});

it("stays silent when denying a preload", () => {
	expect(() => guard(routeArgs(["staff"], true))).toThrow();
	expect(takeAccessDenied()).toBe(false);
});
