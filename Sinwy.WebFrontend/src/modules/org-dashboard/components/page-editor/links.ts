import {
	isSafeLink,
	type LinkTarget,
	PAGE_DOCUMENT_LIMITS,
	webAddress,
} from "@sinwy/shared";

export type LinkChoice = LinkTarget["kind"];

export const LINK_CHOICES: readonly { value: LinkChoice; label: string }[] = [
	{ value: "booking", label: "Booking page" },
	{ value: "service", label: "One service's booking" },
	{ value: "page", label: "Another page" },
	{ value: "web", label: "Web address" },
];

type NamedService = { id: string; name: string };
export type NamedPage = { id: string; title: string; slug: string };

/** The live page a link opens: by id, or an old Button's bare slug. */
export function linkedPage(
	target: LinkTarget,
	pages: readonly NamedPage[],
): NamedPage | undefined {
	if (target.kind === "page") return pages.find((p) => p.id === target.pageId);
	if (target.kind === "web") return pages.find((p) => p.slug === target.href);
	return undefined;
}

/** The picker's choice for a stored link, and the words that name its target. */
export function describeLink(
	target: LinkTarget,
	services: readonly NamedService[],
	pages: readonly NamedPage[],
): { choice: LinkChoice; words: string } {
	const page = linkedPage(target, pages);
	if (page) return { choice: "page", words: `Another page: ${page.title}` };
	switch (target.kind) {
		case "booking":
			return { choice: "booking", words: "Booking page" };
		case "service": {
			const service = services.find((s) => s.id === target.serviceId);
			return {
				choice: "service",
				words: service
					? `Booking: ${service.name}`
					: "A service you no longer offer",
			};
		}
		case "page":
			return { choice: "page", words: "A page that isn't live" };
		case "web":
			return { choice: "web", words: "Web address" };
	}
}

/** The link a typed web address stores, or `null` when the server would refuse it. */
export function typedWebLink(text: string): string | null {
	const href = webAddress(text);
	if (href === "") return "";
	return isSafeLink(href) && href.length <= PAGE_DOCUMENT_LIMITS.url
		? href
		: null;
}
