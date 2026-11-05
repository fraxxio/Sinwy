import { describe, expect, it } from "bun:test";
import {
	receiptHeadingOf,
	receiptNumberOf,
} from "#/modules/account-dashboard/lib/receipt";

describe("receiptHeadingOf", () => {
	it("reads Receipt once the business has marked it as paid", () => {
		expect(receiptHeadingOf("paid")).toBe("Receipt");
	});

	it("says a pending payment isn't paid yet", () => {
		expect(receiptHeadingOf("pending")).toBe("Payment summary · Not paid yet");
	});
});

describe("receiptNumberOf", () => {
	it("is the first 8 characters of the id, uppercased", () => {
		expect(receiptNumberOf("0f3a9c1e-7b2d-4e8f-a1b2-c3d4e5f60718")).toBe(
			"0F3A9C1E",
		);
	});
});
