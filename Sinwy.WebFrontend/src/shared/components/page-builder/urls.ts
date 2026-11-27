import {
	isSafeHref,
	isSafeImageSrc,
	isSafeLink,
	linkTarget,
} from "@sinwy/shared";

/** Absolute and root links pass through; a bare path like `book` is under the organization, and `page:<id>` is the address in `pageAddresses` (id → slug). */
export const resolveHref = (
	href: string,
	organizationSlug: string,
	pageAddresses: ReadonlyMap<string, string> = new Map(),
): string | null => {
	const target = linkTarget(href);
	if (target.kind === "page") {
		const slug = pageAddresses.get(target.pageId);
		return slug === undefined ? null : resolveHref(slug, organizationSlug);
	}
	if (isSafeHref(href)) return href;
	if (href && isSafeLink(href)) return `/${organizationSlug}/${href}`;
	return null;
};

export const imageSrc = (src: string) => (isSafeImageSrc(src) ? src : null);
