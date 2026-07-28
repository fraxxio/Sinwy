import { expect, it } from "bun:test";
import { resetPasswordSchema } from "../lib/useResetPassword";

const valid = { password: "seaweed-42!", confirmPassword: "seaweed-42!" };

const errorFor = (patch: Partial<typeof valid>) => {
	const result = resetPasswordSchema.safeParse({ ...valid, ...patch });
	return result.success ? null : result.error.issues[0]?.path.join(".");
};

it("accepts a valid new password", () => {
	expect(resetPasswordSchema.safeParse(valid).success).toBe(true);
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

it("rejects passwords past better-auth's 128 char limit", () => {
	const long = `seaweed-4${"a".repeat(120)}`;
	expect(errorFor({ password: long, confirmPassword: long })).toBe("password");
});

it("rejects a mismatched confirmation", () => {
	expect(errorFor({ confirmPassword: "seaweed-43!" })).toBe("confirmPassword");
});
