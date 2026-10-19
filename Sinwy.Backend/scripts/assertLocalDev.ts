import appConfig from "@config";

const localDbHosts = ["localhost", "127.0.0.1", "::1"];

export const assertLocalDev = (action: string) => {
	if (appConfig.NODE_ENV !== "local" && appConfig.NODE_ENV !== "dev") {
		console.error(
			`Refusing to ${action} with NODE_ENV="${appConfig.NODE_ENV}"`,
		);
		process.exit(1);
	}

	if (!localDbHosts.includes(appConfig.POSTGRES_HOST)) {
		console.error(
			`Refusing to ${action} against non-local DB host "${appConfig.POSTGRES_HOST}"`,
		);
		process.exit(1);
	}
};
