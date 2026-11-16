const SAFE_URL = /^(https?:|mailto:|tel:|\/|#)/i;

/** Absolute and root links pass through; a bare path like "book" is under the organization. */
export const resolveHref = (
	href: string | null | undefined,
	organizationSlug: string,
) => {
	if (!href) return null;
	if (SAFE_URL.test(href)) return href;
	if (/^[a-z0-9-]+(\/[\w-]*)*$/i.test(href))
		return `/${organizationSlug}/${href}`;
	return null;
};

export const imageSrc = (src: string | null | undefined) =>
	src && /^(https?:|\/)/i.test(src) ? src : null;
