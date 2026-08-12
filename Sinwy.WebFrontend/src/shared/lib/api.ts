import appConfig from "@config";
import type { ApiResponse } from "@sinwy/shared";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";

/**
 * In the browser /api is same-origin and the cookie jar rides along. On the
 * server there is neither, so address the backend directly and forward the
 * incoming request's cookies to keep the session.
 */
const origin = createIsomorphicFn()
	.client(() => "")
	.server(() => appConfig.BACKEND_URL);

const forwardedCookie = createIsomorphicFn()
	.client((): string | null => null)
	.server((): string | null => {
		try {
			return getRequestHeaders().get("cookie") ?? null;
		} catch {
			// no request in flight (background task, test) send it unauthenticated
			// rather than throwing out of a function callers expect never to throw
			return null;
		}
	});

export async function api<T>(
	path: string,
	init?: RequestInit,
): Promise<ApiResponse<T>> {
	const { headers, ...rest } = init ?? {};
	const cookie = forwardedCookie();

	let res: Response;
	try {
		res = await fetch(`${origin()}/api${path}`, {
			...rest,
			headers: {
				"Content-Type": "application/json",
				...(cookie ? { cookie } : {}),
				...headers,
			},
		});
	} catch {
		return { isSuccess: false, data: null, message: "Network error", code: 0 };
	}

	try {
		return (await res.json()) as ApiResponse<T>;
	} catch {
		// a body that isn't our envelope (proxy error page, empty 401)
		return {
			isSuccess: false,
			data: null,
			message: "Unexpected server response",
			code: res.status,
		};
	}
}
