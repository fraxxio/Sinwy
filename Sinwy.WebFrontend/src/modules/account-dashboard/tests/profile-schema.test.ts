import { expect, it } from "bun:test";
import { PROFILE_LIMITS, profileSchema } from "@sinwy/shared";

it("trims the name", () => {
	const result = profileSchema.safeParse({ name: "  Jordan Rivera  " });
	expect(result.success && result.data.name).toBe("Jordan Rivera");
});

it("rejects an empty or whitespace-only name", () => {
	expect(profileSchema.safeParse({ name: "" }).success).toBe(false);
	expect(profileSchema.safeParse({ name: "   " }).success).toBe(false);
});

it("rejects a name over the limit", () => {
	const name = "a".repeat(PROFILE_LIMITS.name + 1);
	expect(profileSchema.safeParse({ name }).success).toBe(false);
	expect(
		profileSchema.safeParse({ name: "a".repeat(PROFILE_LIMITS.name) }).success,
	).toBe(true);
});
