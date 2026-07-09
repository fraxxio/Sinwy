export type ApiResponse<T = unknown> =
	| { isSuccess: true; data: T; message: string | null; code: number }
	| { isSuccess: false; data: null; message: string; code: number };
