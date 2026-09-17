import { storageClient } from "@backend/infrastructure/storage";
import { fail } from "@backend/lib/app/respond";
import type { Handler } from "@backend/lib/app/types";

const FILES_PREFIX = "/api/files/";

export const serveFileHandler: Handler = (c) => {
	const { pathname } = new URL(c.req.url);
	const key = decodeURIComponent(pathname.slice(FILES_PREFIX.length));
	if (!key) return fail("Not found", 404);
	return storageClient.serve(key);
};
