import type { ApiResponse } from "@sinwy/shared";

// ponytail: relative URL → browser-only. For server (loaders/server fns) prepend an absolute base.
export async function api<T>(
	path: string,
	init?: RequestInit,
): Promise<ApiResponse<T>> {
	try {
		const res = await fetch(`/api${path}`, {
			method: "GET",
			headers: { "Content-Type": "application/json", ...init?.headers },
			...init,
		});
		return (await res.json()) as ApiResponse<T>;
	} catch {
		return { isSuccess: false, data: null, message: "Network error", code: 0 };
	}
}
