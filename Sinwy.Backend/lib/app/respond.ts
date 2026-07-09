import type { ApiResponse } from "@sinwy/shared";

export const ok = <T>(
	data: T,
	status = 200,
	message: string | null = null,
	code = 0,
) =>
	Response.json(
		{ isSuccess: true, data, message, code } satisfies ApiResponse<T>,
		{
			status,
		},
	);

export const fail = (message: string, status: number, code = status) =>
	Response.json(
		{
			isSuccess: false,
			data: null,
			message,
			code,
		} satisfies ApiResponse<never>,
		{ status },
	);
