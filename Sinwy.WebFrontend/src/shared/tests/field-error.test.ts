import { expect, it } from "bun:test";
import { fieldErrorState } from "#/shared/lib/field-error";

const errors = [{ message: "Tagline is required" }];

it("stays quiet while the field is still being filled in", () => {
	expect(
		fieldErrorState({
			isBlurred: false,
			submissionAttempts: 0,
			errors,
			value: "ab",
		}),
	).toEqual({ error: undefined, valid: false });
});

it("shows the error once the field is left", () => {
	expect(
		fieldErrorState({
			isBlurred: true,
			submissionAttempts: 0,
			errors,
			value: "ab",
		}).error,
	).toBe("Tagline is required");
});

it("shows the error on a submit attempt, even if the field was never touched", () => {
	expect(
		fieldErrorState({
			isBlurred: false,
			submissionAttempts: 1,
			errors,
			value: "",
		}).error,
	).toBe("Tagline is required");
});

it("marks a revealed, filled in, error free field as valid", () => {
	const state = fieldErrorState({
		isBlurred: true,
		submissionAttempts: 0,
		errors: [],
		value: "Sharp cuts",
	});
	expect(state).toEqual({ error: undefined, valid: true });
});

it("does not call an empty field valid", () => {
	expect(
		fieldErrorState({
			isBlurred: true,
			submissionAttempts: 1,
			errors: [],
			value: "",
		}).valid,
	).toBe(false);
});
