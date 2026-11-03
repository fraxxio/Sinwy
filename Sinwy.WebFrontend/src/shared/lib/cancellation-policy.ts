/** A cancellation window as words, e.g. "24 hours". */
export const formatCancellationWindow = (minutes: number) => {
	const hours = minutes / 60;
	return hours === 1 ? "1 hour" : `${hours} hours`;
};

/** The policy a customer reads before booking a service with this window. */
export const formatCancellationPolicy = (windowMinutes: number) =>
	windowMinutes === 0
		? "You can cancel any time before the start"
		: `Free cancellation up to ${formatCancellationWindow(windowMinutes)} before the start`;
