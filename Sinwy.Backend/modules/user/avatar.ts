import { AVATAR_LIMITS, type AvatarMimeType } from "@sinwy/shared";

export type AvatarErrorKind = "too-large" | "unsupported-type";

export class AvatarError extends Error {
	kind: AvatarErrorKind;

	constructor(kind: AvatarErrorKind, message: string) {
		super(message);
		this.name = "AvatarError";
		this.kind = kind;
	}
}

const extensions: Record<AvatarMimeType, string> = {
	"image/png": "png",
	"image/jpeg": "jpg",
	"image/webp": "webp",
};

const isAllowedMimeType = (type: string): type is AvatarMimeType =>
	(AVATAR_LIMITS.mimeTypes as readonly string[]).includes(type);

const ascii = (bytes: Uint8Array, start: number, end: number) =>
	String.fromCharCode(...bytes.subarray(start, end));

const startsWith = (bytes: Uint8Array, signature: number[]) =>
	signature.every((byte, i) => bytes[i] === byte);

const hasMagicBytes = (bytes: Uint8Array, type: AvatarMimeType) => {
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

export const avatarExtension = (type: AvatarMimeType) => extensions[type];

/** Checks size, declared type and magic bytes; returns the bytes and the file's verified type. */
export const validateAvatar = async (file: File) => {
	if (file.size > AVATAR_LIMITS.maxBytes) {
		throw new AvatarError("too-large", "Image must be 2 MB or smaller");
	}
	if (!isAllowedMimeType(file.type)) {
		throw new AvatarError(
			"unsupported-type",
			"Only PNG, JPEG and WebP images are allowed",
		);
	}
	const bytes = new Uint8Array(await file.arrayBuffer());
	if (!hasMagicBytes(bytes, file.type)) {
		throw new AvatarError(
			"unsupported-type",
			"File content does not match its image type",
		);
	}
	return { bytes, type: file.type };
};
