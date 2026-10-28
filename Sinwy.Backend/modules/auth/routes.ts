import { auth } from "@authModule";
import type { IApp } from "@backend/lib/app/types";
import { createLogger } from "@logger";
import { AUTH_ERROR_CODES } from "@sinwy/shared";

const authLogger = createLogger("auth");

const deliberateCodes = new Set<string>(Object.values(AUTH_ERROR_CODES));

/** A 5xx body can carry Polar or database text, so only our own codes reach the client. */
const hideServerFailure = async (path: string, res: Response) => {
	if (res.status < 500) return res;
	if (!res.headers.get("content-type")?.includes("application/json"))
		return res;

	const body = (await res
		.clone()
		.json()
		.catch(() => null)) as { code?: unknown } | null;
	if (typeof body?.code === "string" && deliberateCodes.has(body.code))
		return res;

	authLogger.error("Auth endpoint failed", { path, status: res.status });
	const headers = new Headers(res.headers);
	headers.delete("content-length");
	return Response.json(
		{
			code: "INTERNAL_SERVER_ERROR",
			message: "Something went wrong. Try again in a moment.",
		},
		{ status: res.status, headers },
	);
};

/**
 * Docs `/api/auth/reference`
 */
export const registerAuthRoutes = (app: IApp) => {
	app.route(
		"/api/auth/*",
		async (c) =>
			hideServerFailure(new URL(c.req.url).pathname, await auth.handler(c.req)),
		{ method: ["POST", "GET"] },
	);
};
