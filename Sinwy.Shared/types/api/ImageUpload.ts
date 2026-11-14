/** Every uploaded image: avatars and organization logos. */
export const IMAGE_UPLOAD_LIMITS = {
	maxBytes: 2 * 1024 * 1024,
	mimeTypes: ["image/png", "image/jpeg", "image/webp"],
} as const;

export type ImageMimeType = (typeof IMAGE_UPLOAD_LIMITS.mimeTypes)[number];
