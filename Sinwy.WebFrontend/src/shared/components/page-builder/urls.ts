import { isSafeHref, isSafeImageSrc, isSafeLink } from "@sinwy/shared";

/** Absolute and root links pass through; a bare path like `book` is under the organization. */
export const resolveHref = (href: string, organizationSlug: string) => {
	if (isSafeHref(href)) return href;
	if (href && isSafeLink(href)) return `/${organizationSlug}/${href}`;
	return null;
};

export const imageSrc = (src: string) => (isSafeImageSrc(src) ? src : null);
