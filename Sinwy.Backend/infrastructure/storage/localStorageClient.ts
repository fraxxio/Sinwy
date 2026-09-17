import { unlink } from "node:fs/promises";
import { resolve, sep } from "node:path";
import type { StorageClient } from "./storageClientTypes";

// keys are random, so a served object never changes under its URL
const CACHE_CONTROL = "public, max-age=31536000, immutable";

export const createLocalStorageClient = (rootDir: string): StorageClient => {
	const root = resolve(rootDir);

	const pathFor = (key: string) => {
		const path = resolve(root, key);
		if (!path.startsWith(root + sep)) {
			throw new Error(`Storage key escapes the storage root: ${key}`);
		}
		return path;
	};

	return {
		async put(key, bytes) {
			await Bun.write(pathFor(key), bytes);
		},
		async delete(key) {
			await unlink(pathFor(key)).catch((error: NodeJS.ErrnoException) => {
				if (error.code !== "ENOENT") throw error;
			});
		},
		async serve(key) {
			const file = Bun.file(pathFor(key));
			if (!(await file.exists())) return new Response(null, { status: 404 });
			return new Response(file, {
				headers: { "Cache-Control": CACHE_CONTROL },
			});
		},
	};
};

export const localStorageClient = createLocalStorageClient(
	resolve(import.meta.dir, "../../.storage"),
);
