/**
 * Polls read until its result satisfies predicate and resolves that result.
 * A failed read (throw or null) counts as an attempt and doesn't abort.
 * Resolves null when attempts run out or isCancelled reports true (e.g. the
 * caller unmounted).
 */
export async function pollUntil<T>(
	read: () => Promise<T | null>,
	predicate: (value: T) => boolean,
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
): Promise<T | null> {
	for (let i = 0; i < attempts; i++) {
		if (isCancelled()) return null;
		const value = await read().catch(() => null);
		if (value !== null && predicate(value)) return value;
		await sleep(intervalMs);
	}
	return null;
}
