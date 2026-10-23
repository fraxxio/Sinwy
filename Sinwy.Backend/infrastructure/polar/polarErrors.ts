import {
	PolarClientError,
	PolarNetworkError,
	PolarServerError,
} from "@polar-sh/sdk";

/** "rejected": Polar answered 4xx; "unavailable": 5xx, timeout or no connection. */
export type PolarFailure = "rejected" | "unavailable";

/** null for anything that is not a Polar failure, i.e. a bug on our side. */
export const polarFailureOf = (error: unknown): PolarFailure | null => {
	if (error instanceof PolarClientError) return "rejected";
	if (error instanceof PolarServerError || error instanceof PolarNetworkError)
		return "unavailable";
	return null;
};

// untyped 4xx errors carry the raw response text instead of the parsed body
const bodyOf = (error: PolarClientError) => {
	if (typeof error.error !== "string") return error.error;
	try {
		return JSON.parse(error.error) as unknown;
	} catch {
		return undefined;
	}
};

const detailOf = (error: PolarClientError) => {
	const body = bodyOf(error);
	if (typeof body !== "object" || body === null) return undefined;
	const { detail } = body as { detail?: unknown };
	if (typeof detail === "string") return detail;
	// HTTPValidationError: keep the messages, never the rejected input
	if (Array.isArray(detail))
		return detail.map((item: { msg?: unknown }) => item.msg).join("; ");
	return undefined;
};

/** Log context for an error; a Polar error's message and body can carry customer data. */
export const describePolarError = (error: unknown) => {
	if (error instanceof PolarClientError)
		return {
			error: error.name,
			statusCode: error.statusCode,
			detail: detailOf(error),
		};
	if (error instanceof PolarServerError)
		return { error: error.name, statusCode: error.statusCode };
	if (error instanceof PolarNetworkError) return { error: error.name };
	return {
		error: error instanceof Error ? error.message : String(error),
	};
};
