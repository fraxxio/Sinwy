const SAFE_HREF = /^(https?:|mailto:|tel:|\/|#)/i;
const SAFE_IMAGE_SRC = /^(https?:|\/)/i;

/** A link the storefront may render: http(s), `mailto:`, `tel:`, root-relative or `#`. */
export const isSafeHref = (href: string) => SAFE_HREF.test(href);

/** An image source the storefront may render: http(s) or root-relative. */
export const isSafeImageSrc = (src: string) => SAFE_IMAGE_SRC.test(src);
