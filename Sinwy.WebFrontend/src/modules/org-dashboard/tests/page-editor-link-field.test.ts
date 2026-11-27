import { describe, expect, it } from "bun:test";
import { linkTarget } from "@sinwy/shared";
import {
	describeLink,
	type LinkChoice,
	typedWebLink,
} from "../components/page-editor/links";

const services = [
	{ id: "haircut-id", name: "Haircut" },
	{ id: "colouring-id", name: "Colouring" },
];

const wordsFor = (href: string) => describeLink(linkTarget(href), services);

describe("describeLink", () => {
	it.each<[string, LinkChoice, string]>([
		["book", "booking", "Booking page"],
		["book?service=colouring-id", "service", "Booking: Colouring"],
		["book?service=gone-id", "service", "A service you no longer offer"],
		["https://x", "web", "Web address"],
		["tel:+37060000000", "web", "Web address"],
		["#prices", "web", "Web address"],
		["about-us", "web", "Web address"],
		["", "web", "Web address"],
	])("opens %p on %p as %p", (href, choice, words) => {
		expect(wordsFor(href)).toEqual({ choice, words });
	});
});

describe("typedWebLink", () => {
	it("stores a bare domain with https://", () => {
		expect(typedWebLink(" example.com ")).toBe("https://example.com");
	});

	it("keeps addresses the link rule already accepts", () => {
		expect(typedWebLink("http://x.test/a")).toBe("http://x.test/a");
		expect(typedWebLink("mailto:a@b.test")).toBe("mailto:a@b.test");
		expect(typedWebLink("#prices")).toBe("#prices");
	});

	it("clears the link when the text is empty", () => {
		expect(typedWebLink("  ")).toBe("");
	});

	it("writes nothing for a link the server refuses", () => {
		expect(typedWebLink("javascript:x")).toBeNull();
		expect(typedWebLink("data:text/html,x")).toBeNull();
		expect(typedWebLink(`https://x.test/${"a".repeat(2048)}`)).toBeNull();
	});
});
