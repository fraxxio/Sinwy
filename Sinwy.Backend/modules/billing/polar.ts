import {
	describePolarError,
	type PolarFailure,
	polarFailureOf,
} from "@backend/infrastructure/polar";
import { createLogger } from "@logger";

const billingLogger = createLogger("billing");

/** Polar's enums are open: a value added on their side must not pass as one of ours. */
export const knownValue = <T extends string>(
	known: readonly T[],
	value: string,
	field: string,
): T | null => {
	const match = known.find((candidate) => candidate === value);
	if (!match) billingLogger.warn("Unknown Polar enum value", { field, value });
	return match ?? null;
};

/** Logs a Polar failure without its body. Rethrows anything else: that's a bug on our side. */
export const toPolarFailure = (
	error: unknown,
	message: string,
	context: Record<string, unknown>,
): PolarFailure => {
	const failure = polarFailureOf(error);
	if (!failure) throw error;
	billingLogger.error(message, { ...context, ...describePolarError(error) });
	return failure;
};
