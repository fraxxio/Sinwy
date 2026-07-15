/**
 * Polls getStatus until it returns "active". A failed request (throw or null)
 * counts as an attempt and doesn't abort. Resolves false when attempts run
 * out or isCancelled reports true (e.g. the caller unmounted).
 */
export async function pollUntilActive(
	getStatus: () => Promise<string | null>,
	{
		attempts = 30,
		intervalMs = 2000,
		sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
		isCancelled = () => false,
	}: {
		attempts?: number;
		intervalMs?: number;
		sleep?: (ms: number) => Promise<void>;
		isCancelled?: () => boolean;
	} = {},
): Promise<boolean> {
	for (let i = 0; i < attempts; i++) {
		if (isCancelled()) return false;
		const status = await getStatus().catch(() => null);
		if (status === "active") return true;
		await sleep(intervalMs);
	}
	return false;
}
