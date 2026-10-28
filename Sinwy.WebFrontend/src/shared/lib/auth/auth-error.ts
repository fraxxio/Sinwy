import { AUTH_ERROR_CODES } from "@sinwy/shared";

export const SERVER_ERROR_MESSAGE =
	"Something went wrong. Try again in a moment.";

type AuthClientError = {
	code?: string | undefined;
	message?: string | undefined;
	status?: number | undefined;
};

const knownCodes = new Set<string>(Object.values(AUTH_ERROR_CODES));

/** The text to show for a Better Auth client error; server failures never show their own message. */
export const authErrorMessage = ({
	code,
	message,
	status,
}: AuthClientError) => {
	const deliberate =
		(status !== undefined && status < 500) ||
		(code !== undefined && knownCodes.has(code));
	return (deliberate && message) || SERVER_ERROR_MESSAGE;
};
