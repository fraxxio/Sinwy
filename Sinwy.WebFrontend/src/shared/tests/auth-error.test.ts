import { expect, it } from "bun:test";
import { AUTH_ERROR_CODES } from "@sinwy/shared";
import {
	authErrorMessage,
	SERVER_ERROR_MESSAGE,
} from "#/shared/lib/auth/auth-error";

it("hides the message of a server failure", () => {
	expect(
		authErrorMessage({
			status: 500,
			code: "INTERNAL_SERVER_ERROR",
			message: "Polar customer creation failed. Error: …",
		}),
	).toBe(SERVER_ERROR_MESSAGE);
});

it("hides the message when there is no status, as on a network failure", () => {
	expect(authErrorMessage({ message: "Failed to fetch" })).toBe(
		SERVER_ERROR_MESSAGE,
	);
});

it("shows the message of a refusal", () => {
	expect(
		authErrorMessage({ status: 401, message: "Invalid email or password" }),
	).toBe("Invalid email or password");
});

it("shows the message of a server failure that carries one of our codes", () => {
	expect(
		authErrorMessage({
			status: 503,
			code: AUTH_ERROR_CODES.PLAN_EXISTS,
			message: "You already have a plan",
		}),
	).toBe("You already have a plan");
});

it("falls back when a refusal has no message", () => {
	expect(authErrorMessage({ status: 400 })).toBe(SERVER_ERROR_MESSAGE);
});
