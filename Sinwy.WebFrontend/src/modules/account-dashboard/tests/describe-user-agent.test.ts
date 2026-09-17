import { expect, it } from "bun:test";
import { describeUserAgent } from "../lib/describe-user-agent";

const CHROME_MAC =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const SAFARI_IPHONE =
	"Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const FIREFOX_WINDOWS =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0";
const EDGE_WINDOWS =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0";
const CHROME_ANDROID =
	"Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36";
const CHROME_LINUX =
	"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

it("names the browser and the operating system", () => {
	expect(describeUserAgent(CHROME_MAC)).toBe("Chrome on macOS");
	expect(describeUserAgent(SAFARI_IPHONE)).toBe("Safari on iOS");
	expect(describeUserAgent(FIREFOX_WINDOWS)).toBe("Firefox on Windows");
	expect(describeUserAgent(CHROME_LINUX)).toBe("Chrome on Linux");
});

it("prefers the specific brand over the engines it embeds", () => {
	expect(describeUserAgent(EDGE_WINDOWS)).toBe("Edge on Windows");
	expect(describeUserAgent(CHROME_ANDROID)).toBe("Chrome on Android");
});

it("falls back when nothing is recognisable", () => {
	expect(describeUserAgent("curl/8.6.0")).toBe("Unknown device");
	expect(describeUserAgent(null)).toBe("Unknown device");
	expect(describeUserAgent("")).toBe("Unknown device");
});

it("shows whichever half it could read", () => {
	expect(describeUserAgent("Something/1.0 (Windows NT 10.0)")).toBe("Windows");
});
