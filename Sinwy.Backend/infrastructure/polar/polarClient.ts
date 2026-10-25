import appConfig from "@config";
import { createPolar, createPolarCore } from "@polar-sh/sdk/2026-10";

// the API version is pinned by the import path; models and errors come from the same one
export {
	errors as PolarApiErrors,
	type models as PolarModels,
} from "@polar-sh/sdk/2026-10";

const options = {
	accessToken: appConfig.POLAR_ACCESS_TOKEN,
	environment: appConfig.POLAR_SERVER,
	// seconds; a hung Polar must fail like a down one
	timeout: 5,
};

export const polarClient = createPolar(options);

/**
 * The better-auth plugin takes a core client and calls standalone SDK
 * functions on it. Its customer delete on user deletion takes no options, so
 * every customer delete sent through this client is anonymized.
 */
export const polarCore = createPolarCore(options);
const buildRequest = polarCore.buildRequest.bind(polarCore);
polarCore.buildRequest = (method, url, pathParams, queryParams, body) =>
	buildRequest(
		method,
		url,
		pathParams,
		method === "DELETE" && url === "/v1/customers/external/{external_id}"
			? { ...queryParams, anonymize: true }
			: queryParams,
		body,
	);
