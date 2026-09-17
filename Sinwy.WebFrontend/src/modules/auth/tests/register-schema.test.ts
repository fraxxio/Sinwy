import { expect, it } from "bun:test";
import { registerSchema } from "../lib/useRegister";

const valid = {
	name: "Jordan Rivera",
	email: "jordan@example.com",
	password: "seaweed-42!",
	confirmPassword: "seaweed-42!",
};

const errorFor = (patch: Partial<typeof valid>) => {
	const result = registerSchema.safeParse({ ...valid, ...patch });
	return result.success ? null : result.error.issues[0]?.path.join(".");
};

it("accepts a valid registration", () => {
	expect(registerSchema.safeParse(valid).success).toBe(true);
});

it("accepts initials and apostrophes, rejects one-letter or non-letter names", () => {
	expect(errorFor({ name: "J. Rivera" })).toBeNull();
	expect(errorFor({ name: "O'Neil" })).toBeNull();
	expect(errorFor({ name: "J" })).toBe("name");
	expect(errorFor({ name: "Jordan2" })).toBe("name");
});

it("rejects invalid emails", () => {
	expect(errorFor({ email: "jordan@" })).toBe("email");
});

it("requires 10+ chars with a number and a symbol", () => {
	expect(
		errorFor({ password: "seaweed-4", confirmPassword: "seaweed-4" }),
	).toBe("password");
	expect(
		errorFor({ password: "seaweedseaweed", confirmPassword: "seaweedseaweed" }),
	).toBe("password");
	expect(
		errorFor({ password: "seaweed42424", confirmPassword: "seaweed42424" }),
	).toBe("password");
});

it("rejects a mismatched confirmation", () => {
	expect(errorFor({ confirmPassword: "seaweed-43!" })).toBe("confirmPassword");
});
