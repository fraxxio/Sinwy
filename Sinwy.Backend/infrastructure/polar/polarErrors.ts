import { HTTPClientError } from "@polar-sh/sdk/models/errors/httpclienterrors";
import { PolarError } from "@polar-sh/sdk/models/errors/polarerror";

/** "rejected": Polar answered 4xx; "unavailable": 5xx, timeout or no connection. */
export type PolarFailure = "rejected" | "unavailable";

/** null for anything that is not a Polar failure, i.e. a bug on our side. */
export const polarFailureOf = (error: unknown): PolarFailure | null => {
	if (error instanceof PolarError)
		return error.statusCode >= 400 && error.statusCode < 500
			? "rejected"
			: "unavailable";
	return error instanceof HTTPClientError ? "unavailable" : null;
};

const detailOf = (error: PolarError) => {
	const detail = (error as { detail?: unknown }).detail;
	if (typeof detail === "string") return detail;
	// HTTPValidationError: keep the messages, never the rejected input
	if (Array.isArray(detail))
		return detail.map((item: { msg?: unknown }) => item.msg).join("; ");
	return undefined;
};

/** Log context for an error; a PolarError's message and body can carry customer data. */
export const describePolarError = (error: unknown) => {
	if (error instanceof PolarError)
		return {
			error: error.name,
			statusCode: error.statusCode,
			detail: detailOf(error),
		};
	return {
		error: error instanceof Error ? error.message : String(error),
	};
};
