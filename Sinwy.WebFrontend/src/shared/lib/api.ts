import type { ApiResponse } from "@sinwy/shared";

// ponytail: relative URL → browser-only. For server (loaders/server fns) prepend an absolute base.
export async function api<T>(
	path: string,
	init?: RequestInit,
): Promise<ApiResponse<T>> {
	const { headers, ...rest } = init ?? {};
	try {
		const res = await fetch(`/api${path}`, {
			...rest,
			headers: { "Content-Type": "application/json", ...headers },
		});
		return (await res.json()) as ApiResponse<T>;
	} catch {
		return { isSuccess: false, data: null, message: "Network error", code: 0 };
	}
}
