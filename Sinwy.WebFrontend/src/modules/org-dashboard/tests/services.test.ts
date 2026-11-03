import { expect, it } from "bun:test";
import { hasPermission, type OrgRole } from "@sinwy/shared";
import { isRedirect } from "@tanstack/react-router";
import { takeAccessDenied } from "#/shared/lib/auth/access-denied";
import { requirePermission } from "#/shared/lib/auth/protected-route";
import {
	formatCancellationPolicy,
	formatCancellationWindow,
} from "#/shared/lib/cancellation-policy";
import {
	CANCELLATION_WINDOW_OPTIONS,
	formatDuration,
	NEW_SERVICE_VALUES,
	serviceFormSchema,
	toServiceFormValues,
	toServiceInput,
} from "../lib/services";

const values = (price: string) => ({
	...NEW_SERVICE_VALUES,
	name: "Cut",
	price,
});

const priceError = (price: string, currency = "EUR") => {
	const result = serviceFormSchema(currency).safeParse(values(price));
	return result.success
		? null
		: result.error.issues.find((issue) => issue.path[0] === "price")?.message;
};

it("submits the typed price in minor units", () => {
	expect(toServiceInput(values("25"), "EUR").priceMinor).toBe(2500);
	expect(toServiceInput(values("25.5"), "EUR").priceMinor).toBe(2550);
	expect(toServiceInput(values("25.50"), "EUR").priceMinor).toBe(2550);
	expect(toServiceInput(values("2500"), "JPY").priceMinor).toBe(2500);
});

it("rejects prices the currency can't hold", () => {
	expect(priceError("25.505")).toBe("Use at most 2 decimals");
	expect(priceError("2500.5", "JPY")).toBe("JPY prices have no decimals");
	expect(priceError("")).toBe("Price is required");
	expect(priceError("cheap")).toBeTruthy();
});

it("submits the selected minutes as numbers", () => {
	const input = toServiceInput(
		{ ...values("10"), durationMinutes: "45", bufferAfterMinutes: "10" },
		"EUR",
	);
	expect(input).toEqual({
		name: "Cut",
		description: "",
		priceMinor: 1000,
		durationMinutes: 45,
		bufferBeforeMinutes: 0,
		bufferAfterMinutes: 10,
		requiresApproval: false,
		cancellationWindowMinutes: 0,
	});
});

it("loads a saved service back into the same form values", () => {
	const form = {
		...values("25.50"),
		durationMinutes: "90",
		bufferBeforeMinutes: "5",
		requiresApproval: true,
		cancellationWindowMinutes: "1440",
	};
	const input = toServiceInput(form, "EUR");
	const dto = {
		...input,
		id: "s1",
		slug: "cut",
		description: null,
		currency: "EUR",
		isActive: true,
		createdAt: "",
		updatedAt: "",
	};
	expect(toServiceFormValues(dto)).toEqual(form);
});

it("offers the cancellation window presets and refuses anything else", () => {
	expect(CANCELLATION_WINDOW_OPTIONS.map((option) => option.label)).toEqual([
		"None",
		"2 hours",
		"12 hours",
		"24 hours",
		"48 hours",
	]);
	const window = (cancellationWindowMinutes: string) =>
		serviceFormSchema("EUR").safeParse({
			...values("10"),
			cancellationWindowMinutes,
		}).success;
	expect(window("2880")).toBe(true);
	expect(window("60")).toBe(false);
});

it("words the cancellation policy for the storefront", () => {
	expect(formatCancellationWindow(120)).toBe("2 hours");
	expect(formatCancellationPolicy(1440)).toBe(
		"Free cancellation up to 24 hours before the start",
	);
	expect(formatCancellationPolicy(0)).toBe(
		"You can cancel any time before the start",
	);
});

it("formats durations in minutes and hours", () => {
	expect(formatDuration(45)).toBe("45 min");
	expect(formatDuration(60)).toBe("1 h");
	expect(formatDuration(90)).toBe("1 h 30 min");
});

it("gives write controls to owners and admins, not staff", () => {
	const canWrite = (role: OrgRole) => hasPermission([role], "services:write");
	expect(canWrite("owner")).toBe(true);
	expect(canWrite("admin")).toBe(true);
	expect(canWrite("staff")).toBe(false);
	expect(hasPermission(["staff"], "services:read")).toBe(true);
});

it("turns staff away from the new-service page", () => {
	const guard = requirePermission("services:write");
	let thrown: unknown;
	try {
		guard({
			context: { organization: { slug: "acme" }, member: { roles: ["staff"] } },
			preload: false,
		});
	} catch (error) {
		thrown = error;
	}
	expect(isRedirect(thrown)).toBe(true);
	expect(takeAccessDenied()).not.toBeNull();
});
