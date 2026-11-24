/** Every uploaded image: avatars, organization logos and page images. */
export const IMAGE_UPLOAD_LIMITS = {
	maxBytes: 2 * 1024 * 1024,
	mimeTypes: ["image/png", "image/jpeg", "image/webp"],
} as const;

export type ImageMimeType = (typeof IMAGE_UPLOAD_LIMITS.mimeTypes)[number];
