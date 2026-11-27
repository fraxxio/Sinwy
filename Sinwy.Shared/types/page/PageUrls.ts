const SAFE_HREF = /^(https?:|mailto:|tel:|\/|#)/i;
const SAFE_IMAGE_SRC = /^(https?:|\/)/i;

/** A link the storefront may render: http(s), `mailto:`, `tel:`, root-relative or `#`. */
export const isSafeHref = (href: string) => SAFE_HREF.test(href);

/** An image source the storefront may render: http(s) or root-relative. */
export const isSafeImageSrc = (src: string) => SAFE_IMAGE_SRC.test(src);

const BARE_PATH = /^[a-z0-9-]+(\/[\w-]*)*$/;
const BOOKING = "book";
const SERVICE_BOOKING = /^book\?service=([\w-]+)$/;
const PAGE_LINK = /^page:([\w-]+)$/;

/** A Button link: a safe href, a bare path such as `book` or `book?service=<id>` that the storefront resolves under the org, or `page:<pageId>`. */
export const isSafeLink = (href: string) =>
	isSafeHref(href) ||
	BARE_PATH.test(href) ||
	SERVICE_BOOKING.test(href) ||
	PAGE_LINK.test(href);

export type LinkTarget =
	| { kind: "booking" }
	| { kind: "service"; serviceId: string }
	| { kind: "page"; pageId: string }
	| { kind: "web"; href: string };

/** What a stored Button link opens; anything that isn't booking, a service or a page is a web address, as stored. */
export const linkTarget = (href: string): LinkTarget => {
	if (href === BOOKING) return { kind: "booking" };
	const serviceId = SERVICE_BOOKING.exec(href)?.[1];
	if (serviceId) return { kind: "service", serviceId };
	const pageId = PAGE_LINK.exec(href)?.[1];
	if (pageId) return { kind: "page", pageId };
	return { kind: "web", href };
};

export const bookingLink = (serviceId?: string) =>
	serviceId ? `${BOOKING}?service=${serviceId}` : BOOKING;

export const pageLink = (pageId: string) => `page:${pageId}`;

const HAS_SCHEME = /^[a-z][a-z0-9+-]*:/i;

/** A typed web address, trimmed, with `https://` added to a bare domain such as `example.com`. */
export const webAddress = (text: string) => {
	const trimmed = text.trim();
	const bareDomain =
		trimmed.includes(".") &&
		!HAS_SCHEME.test(trimmed) &&
		!trimmed.startsWith("/") &&
		!trimmed.startsWith("#");
	return bareDomain ? `https://${trimmed}` : trimmed;
};
