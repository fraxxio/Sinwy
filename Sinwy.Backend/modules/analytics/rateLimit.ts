type Window = { startedAt: number; count: number };

/** In-memory, per server instance: each key may pass `max` times per window, counted from its first hit. */
export const createRateLimiter = ({
	max,
	windowMs,
}: {
	max: number;
	windowMs: number;
}) => {
	const windows = new Map<string, Window>();
	let sweptAt = 0;

	const sweep = (now: number) => {
		if (now - sweptAt < windowMs) return;
		sweptAt = now;
		for (const [key, window] of windows)
			if (now - window.startedAt >= windowMs) windows.delete(key);
	};

	return (key: string, now = Date.now()) => {
		sweep(now);
		const window = windows.get(key);
		if (!window || now - window.startedAt >= windowMs) {
			windows.set(key, { startedAt: now, count: 1 });
			return true;
		}
		window.count++;
		return window.count <= max;
	};
};
