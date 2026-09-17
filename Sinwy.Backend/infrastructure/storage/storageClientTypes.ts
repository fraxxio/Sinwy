import appConfig from "@config";

export type StorageClient = {
	put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
	delete(key: string): Promise<void>;
	/** Response for GET /api/files/<key>: 404 when missing. */
	serve(key: string): Promise<Response>;
};

// BETTER_AUTH_URL carries the /api/auth path; files live next to it on the same origin
const filesBase = `${new URL(appConfig.BETTER_AUTH_URL).origin}/api/files/`;

/** Canonical public URL for a stored object, independent of the driver. */
export const fileUrl = (key: string) => `${filesBase}${key}`;

/** Inverse of `fileUrl`; null for URLs we do not serve (e.g. a Google avatar). */
export const keyFromFileUrl = (url: string | null | undefined) => {
	if (!url?.startsWith(filesBase)) return null;
	const key = url.slice(filesBase.length);
	return key.length > 0 ? key : null;
};
