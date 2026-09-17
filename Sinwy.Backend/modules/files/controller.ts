import { storageClient } from "@backend/infrastructure/storage";
import { fail } from "@backend/lib/app/respond";
import type { Handler } from "@backend/lib/app/types";

const FILES_PREFIX = "/api/files/";

const notFound = () => fail("Not found", 404);

export const serveFileHandler: Handler = async (c) => {
	const { pathname } = new URL(c.req.url);
	// malformed escapes and traversal keys are client errors, not ours
	try {
		const key = decodeURIComponent(pathname.slice(FILES_PREFIX.length));
		if (!key) return notFound();
		return await storageClient.serve(key);
	} catch {
		return notFound();
	}
};
