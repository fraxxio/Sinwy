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
	{ value: "web", label: "Web address" },
];

type NamedService = { id: string; name: string };

/** The picker's choice for a stored link, and the words that name its target. */
export function describeLink(
	target: LinkTarget,
	services: readonly NamedService[],
): { choice: LinkChoice; words: string } {
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
