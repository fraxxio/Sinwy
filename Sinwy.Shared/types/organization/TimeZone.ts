export const DEFAULT_TIME_ZONE = "UTC";

const TIME_ZONES = new Set(Intl.supportedValuesOf("timeZone"));

// browsers may report a newer name than the runtime lists (Europe/Kyiv vs Europe/Kiev)
const isKnownAlias = (value: string) => {
	if (!/^[A-Za-z]+\/[\w+\-/]+$/.test(value)) return false;
	try {
		new Intl.DateTimeFormat("en", { timeZone: value });
		return true;
	} catch {
		return false;
	}
};

/** An IANA zone name, e.g. "Europe/Vilnius"; offsets like "+02:00" are not zones. */
export const isTimeZone = (value: unknown): value is string =>
	typeof value === "string" &&
	(value === DEFAULT_TIME_ZONE || TIME_ZONES.has(value) || isKnownAlias(value));
