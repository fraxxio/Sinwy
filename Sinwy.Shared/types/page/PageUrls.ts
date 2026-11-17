const ABSOLUTE_OR_ROOT = /^(https?:|mailto:|tel:|\/|#)/i;
const BARE_PATH = /^[a-z0-9-]+(\/[\w-]*)*$/i;
const IMAGE = /^(https?:|\/)/i;

/** Absolute and root links pass through; a bare path like "book" is under the organization. Anything else is refused. */
export const resolveHref = (
	href: string | null | undefined,
	organizationSlug: string,
) => {
	if (!href) return null;
	if (ABSOLUTE_OR_ROOT.test(href)) return href;
	if (BARE_PATH.test(href)) return `/${organizationSlug}/${href}`;
	return null;
};

export const imageSrc = (src: string | null | undefined) =>
	src && IMAGE.test(src) ? src : null;

/** Empty, or a link `resolveHref` keeps. */
export const isSafeHref = (href: string) =>
	href === "" || ABSOLUTE_OR_ROOT.test(href) || BARE_PATH.test(href);

export const isSafeImageSrc = (src: string) => src === "" || IMAGE.test(src);

/** Rich text links must be absolute or root links; a bare path or a `javascript:` URL is refused. */
export const hasOnlySafeLinks = (html: string) =>
	[...html.matchAll(/\shref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)].every(
		(match) =>
			ABSOLUTE_OR_ROOT.test((match[1] ?? match[2] ?? match[3] ?? "").trim()),
	);
