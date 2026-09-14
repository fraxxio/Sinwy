import { expect, test } from "bun:test";
import {
	hasPermission,
	orgAccessRoles,
	PERMISSIONS,
	parseMemberRoles,
	ROLE_PERMISSIONS,
} from "@sinwy/shared";

test("owner holds every permission", () => {
	expect(ROLE_PERMISSIONS.owner).toEqual([
		"bookings:read",
		"bookings:write",
		"services:read",
		"services:write",
		"customers:read",
		"customers:write",
		"pages:read",
		"pages:write",
		"payments:read",
		"analytics:read",
		"team:manage",
		"billing:manage",
		"settings:manage",
	]);
	expect(ROLE_PERMISSIONS.owner).toEqual([...PERMISSIONS]);
});

test("admin holds everything except billing:manage", () => {
	expect(ROLE_PERMISSIONS.admin).toEqual([
		"bookings:read",
		"bookings:write",
		"services:read",
		"services:write",
		"customers:read",
		"customers:write",
		"pages:read",
		"pages:write",
		"payments:read",
		"analytics:read",
		"team:manage",
		"settings:manage",
	]);
});

test("staff holds bookings, customers and read-only services and pages", () => {
	expect(ROLE_PERMISSIONS.staff).toEqual([
		"bookings:read",
		"bookings:write",
		"customers:read",
		"customers:write",
		"services:read",
		"pages:read",
	]);
});

test("staff ⊂ admin ⊂ owner", () => {
	const subset = (a: readonly string[], b: readonly string[]) =>
		a.every((p) => b.includes(p));
	expect(subset(ROLE_PERMISSIONS.staff, ROLE_PERMISSIONS.admin)).toBe(true);
	expect(subset(ROLE_PERMISSIONS.admin, ROLE_PERMISSIONS.owner)).toBe(true);
	expect(ROLE_PERMISSIONS.staff.length).toBeLessThan(
		ROLE_PERMISSIONS.admin.length,
	);
	expect(ROLE_PERMISSIONS.admin.length).toBeLessThan(
		ROLE_PERMISSIONS.owner.length,
	);
});

test("hasPermission is the union over held roles", () => {
	expect(hasPermission(["staff", "admin"], "billing:manage")).toBe(false);
	expect(hasPermission(["staff", "owner"], "billing:manage")).toBe(true);
	expect(hasPermission(["staff"], "settings:manage")).toBe(false);
	expect(hasPermission([], "bookings:read")).toBe(false);
});

test("parseMemberRoles keeps known roles and drops the rest", () => {
	expect(parseMemberRoles("owner, admin")).toEqual(["owner", "admin"]);
	expect(parseMemberRoles("member")).toEqual([]);
	expect(parseMemberRoles("")).toEqual([]);
});

test("orgAccessRoles mirror the matrix and keep better-auth's built-in rights", () => {
	expect(orgAccessRoles.staff.statements.bookings).toEqual(["read", "write"]);
	expect(orgAccessRoles.staff.statements.organization).toEqual([]);
	expect(orgAccessRoles.staff.statements.member).toEqual([]);
	expect(orgAccessRoles.owner.statements.organization).toEqual([
		"update",
		"delete",
	]);
	expect(orgAccessRoles.admin.statements.billing).toEqual([]);
});
