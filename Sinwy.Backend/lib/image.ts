import { readFormData } from "@backend/lib/app/formData";
import { fail } from "@backend/lib/app/respond";
import { IMAGE_UPLOAD_LIMITS, type ImageMimeType } from "@sinwy/shared";

export type ImageErrorKind = "too-large" | "unsupported-type";

export class ImageError extends Error {
	kind: ImageErrorKind;

	constructor(kind: ImageErrorKind, message: string) {
		super(message);
		this.name = "ImageError";
		this.kind = kind;
	}
}

const extensions: Record<ImageMimeType, string> = {
	"image/png": "png",
	"image/jpeg": "jpg",
	"image/webp": "webp",
};

const isAllowedMimeType = (type: string): type is ImageMimeType =>
	(IMAGE_UPLOAD_LIMITS.mimeTypes as readonly string[]).includes(type);

const ascii = (bytes: Uint8Array, start: number, end: number) =>
	String.fromCharCode(...bytes.subarray(start, end));

const startsWith = (bytes: Uint8Array, signature: number[]) =>
	signature.every((byte, i) => bytes[i] === byte);

const hasMagicBytes = (bytes: Uint8Array, type: ImageMimeType) => {
	switch (type) {
		case "image/png":
			return startsWith(
				bytes,
				[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
			);
		case "image/jpeg":
			return startsWith(bytes, [0xff, 0xd8, 0xff]);
		case "image/webp":
			return (
				bytes.length >= 12 &&
				ascii(bytes, 0, 4) === "RIFF" &&
				ascii(bytes, 8, 12) === "WEBP"
			);
	}
};

const TOO_LARGE = "Image must be 2 MB or smaller";

// multipart framing around the file: boundaries, part headers, field name
const UPLOAD_OVERHEAD_BYTES = 16 * 1024;

/** The `file` field of a multipart upload; null when it's missing. Refuses an oversized body before the parser buffers it. */
export const readImageUpload = async (req: Request) => {
	const declared = Number(req.headers.get("content-length"));
	if (declared > IMAGE_UPLOAD_LIMITS.maxBytes + UPLOAD_OVERHEAD_BYTES)
		throw new ImageError("too-large", TOO_LARGE);
	const file = (await readFormData(req))?.get("file");
	return file instanceof File ? file : null;
};

export const respondImageError = (error: ImageError) =>
	fail(error.message, error.kind === "too-large" ? 413 : 400);

export const imageExtension = (type: ImageMimeType) => extensions[type];

/** Checks size, declared type and magic bytes; returns the bytes and the file's verified type. */
export const validateImage = async (file: File) => {
	if (file.size > IMAGE_UPLOAD_LIMITS.maxBytes) {
		throw new ImageError("too-large", TOO_LARGE);
	}
	if (!isAllowedMimeType(file.type)) {
		throw new ImageError(
			"unsupported-type",
			"Only PNG, JPEG and WebP images are allowed",
		);
	}
	const bytes = new Uint8Array(await file.arrayBuffer());
	if (!hasMagicBytes(bytes, file.type)) {
		throw new ImageError(
			"unsupported-type",
			"File content does not match its image type",
		);
	}
	return { bytes, type: file.type };
};
