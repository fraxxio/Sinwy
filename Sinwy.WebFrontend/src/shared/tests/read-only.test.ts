import { describe, expect, it } from "bun:test";
import { API_ERROR_CODES, PERMISSIONS } from "@sinwy/shared";
import {
	canActWith,
	isAllowedWhileInactive,
	isOrganizationInactive,
} from "../lib/auth/read-only";

it("keeps only reads and billing management while inactive", () => {
	expect(PERMISSIONS.filter(isAllowedWhileInactive)).toEqual([
		"bookings:read",
		"services:read",
		"customers:read",
		"pages:read",
		"payments:read",
		"analytics:read",
		"billing:manage",
	]);
});

describe("canActWith", () => {
	it("follows the role alone while the organization is active", () => {
		expect(canActWith(["staff"], true, "bookings:write")).toBe(true);
		expect(canActWith(["staff"], true, "people:manage")).toBe(false);
		expect(canActWith(["owner"], true, "settings:manage")).toBe(true);
	});

	it("turns writes off for every role while inactive", () => {
		for (const permission of ["bookings:write", "people:manage"] as const) {
			expect(canActWith(["owner"], false, permission)).toBe(false);
			expect(canActWith(["admin"], false, permission)).toBe(false);
		}
	});

	it("keeps reads and billing management for roles that hold them", () => {
		expect(canActWith(["staff"], false, "bookings:read")).toBe(true);
		expect(canActWith(["owner"], false, "billing:manage")).toBe(true);
	});

	it("never grants what the role lacks, even when allowed while inactive", () => {
		expect(canActWith(["admin"], false, "billing:manage")).toBe(false);
		expect(canActWith(["staff"], false, "analytics:read")).toBe(false);
		expect(canActWith([], true, "bookings:read")).toBe(false);
	});
});

describe("isOrganizationInactive", () => {
	it("matches the inactive organization code only", () => {
		const refused = (code: number) =>
			({ isSuccess: false, data: null, message: "", code }) as const;

		expect(
			isOrganizationInactive(refused(API_ERROR_CODES.ORGANIZATION_INACTIVE)),
		).toBe(true);
		expect(isOrganizationInactive(refused(409))).toBe(false);
		expect(
			isOrganizationInactive(refused(API_ERROR_CODES.PLAN_UPGRADE_REQUIRED)),
		).toBe(false);
		expect(
			isOrganizationInactive({
				isSuccess: true,
				data: null,
				message: null,
				code: 0,
			}),
		).toBe(false);
	});
});
