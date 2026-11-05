import { expect, it } from "bun:test";
import { PAYMENT_STATUSES } from "@sinwy/shared";
import {
	changeRange,
	paymentsExportUrl,
	paymentsSearchSchema,
} from "#/modules/org-dashboard/lib/payment-search";
import { PAYMENT_STATUS_LABELS } from "#/shared/components/payment/PaymentStatusBadge";

it("leaves the range to the API with no params", () => {
	expect(paymentsSearchSchema.parse({})).toEqual({ page: 1 });
});

it("round-trips a range and a page", () => {
	const search = { from: "2026-11-01", to: "2026-11-30", page: 2 };
	expect(paymentsSearchSchema.parse(search)).toEqual(search);
});

it("drops bad values instead of failing", () => {
	expect(
		paymentsSearchSchema.parse({
			from: "yesterday",
			to: "2026-13-40",
			page: 0,
		}),
	).toEqual({ page: 1 });
	expect(paymentsSearchSchema.parse({ page: "3" })).toEqual({ page: 3 });
});

it("clears a reversed or one-sided range, which the router would otherwise keep from the URL", () => {
	expect(
		paymentsSearchSchema.parse({
			from: "2026-11-02",
			to: "2026-11-01",
			page: 2,
		}),
	).toStrictEqual({ from: undefined, to: undefined, page: 2 });
	expect(paymentsSearchSchema.parse({ from: "2026-11-02" })).toStrictEqual({
		from: undefined,
		to: undefined,
		page: 1,
	});
});

it("moves the other end of the range instead of reversing it", () => {
	const range = { from: "2026-11-01", to: "2026-11-30" };
	expect(changeRange(range, { from: "2026-11-10" })).toEqual({
		from: "2026-11-10",
		to: "2026-11-30",
	});
	expect(changeRange(range, { from: "2026-12-05" })).toEqual({
		from: "2026-12-05",
		to: "2026-12-05",
	});
	expect(changeRange(range, { to: "2026-10-20" })).toEqual({
		from: "2026-10-20",
		to: "2026-10-20",
	});
});

it("builds the same-origin export URL for the range", () => {
	expect(
		paymentsExportUrl("org-1", { from: "2026-11-01", to: "2026-11-30" }),
	).toBe(
		"/api/organizations/org-1/payments/export?from=2026-11-01&to=2026-11-30",
	);
});

it("labels every payment status", () => {
	for (const status of PAYMENT_STATUSES)
		expect(PAYMENT_STATUS_LABELS[status]).toBeTruthy();
});
