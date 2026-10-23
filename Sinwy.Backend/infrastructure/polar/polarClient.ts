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

/** The better-auth plugin takes a core client and calls standalone SDK functions on it. */
export const polarCore = createPolarCore(options);
