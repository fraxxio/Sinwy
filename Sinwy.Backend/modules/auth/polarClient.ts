import appConfig from "@config";
import { Polar } from "@polar-sh/sdk";

// If this client is going to be used elsewhere or new logic specific to polar appears we will move that to it's own module
export const polarClient = new Polar({
	accessToken: appConfig.POLAR_ACCESS_TOKEN,
	server: appConfig.POLAR_SERVER,
});
