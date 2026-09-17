const BROWSERS: [RegExp, string][] = [
	[/Edg\//, "Edge"],
	[/OPR\/|Opera/, "Opera"],
	[/Firefox\//, "Firefox"],
	[/Chrome\/|CriOS\//, "Chrome"],
	[/Safari\//, "Safari"],
];

const SYSTEMS: [RegExp, string][] = [
	[/iPhone|iPad|iPod/, "iOS"],
	[/Android/, "Android"],
	[/Windows/, "Windows"],
	[/Mac OS X|Macintosh/, "macOS"],
	[/CrOS/, "ChromeOS"],
	[/Linux/, "Linux"],
];

const match = (ua: string, table: [RegExp, string][]) =>
	table.find(([pattern]) => pattern.test(ua))?.[1];

/** "Chrome on macOS" from a raw user agent, "Unknown device" when unreadable. */
export function describeUserAgent(userAgent: string | null | undefined) {
	if (!userAgent) return "Unknown device";
	const browser = match(userAgent, BROWSERS);
	const system = match(userAgent, SYSTEMS);
	if (browser && system) return `${browser} on ${system}`;
	return browser ?? system ?? "Unknown device";
}
