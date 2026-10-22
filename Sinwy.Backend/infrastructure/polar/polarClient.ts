import appConfig from "@config";
import { Polar } from "@polar-sh/sdk";

export const polarClient = new Polar({
	accessToken: appConfig.POLAR_ACCESS_TOKEN,
	server: appConfig.POLAR_SERVER,
	// the SDK waits forever by default; a hung Polar must fail like a down one
	timeoutMs: 5_000,
});
