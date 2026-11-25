import { storageClient } from "@backend/infrastructure/storage";
import type { Job } from "@backend/lib/jobs";
import { createLogger } from "@logger";
import { deletePageImages, findUnusedPageImages } from "./repository";

const sweepLogger = createLogger("pages:sweep");

const BATCH_SIZE = 100;
/** An upload may not be in a saved version yet: autosave, a pending upload or an editor left open. */
export const UNUSED_PAGE_IMAGE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Deletes page images that no saved version of any page in their organization
 * uses, once they are old enough. A file that fails to delete keeps its row,
 * so the next run retries it.
 */
export const sweepUnusedPageImages = async (now = new Date()) => {
	const cutoff = new Date(now.getTime() - UNUSED_PAGE_IMAGE_TTL_MS);
	let deleted = 0;
	let failed = 0;
	let afterId: string | null = null;
	for (;;) {
		const batch = await findUnusedPageImages(cutoff, afterId, BATCH_SIZE);
		if (batch.length === 0) break;
		const gone: string[] = [];
		for (const image of batch) {
			try {
				await storageClient.delete(image.key);
				gone.push(image.id);
			} catch (error) {
				failed++;
				sweepLogger.warn("Failed to delete an unused page image", {
					organizationId: image.organizationId,
					key: image.key,
					error,
				});
			}
		}
		if (gone.length > 0) await deletePageImages(gone);
		deleted += gone.length;
		afterId = batch.at(-1)?.id ?? null;
		if (batch.length < BATCH_SIZE) break;
	}
	if (deleted > 0 || failed > 0)
		sweepLogger.info("Swept unused page images", { deleted, failed });
	return { deleted, failed };
};

export const sweepPageImagesJob: Job<
	Awaited<ReturnType<typeof sweepUnusedPageImages>>
> = {
	name: "sweep-page-images",
	intervalMs: 60 * 60 * 1000,
	run: () => sweepUnusedPageImages(),
};
