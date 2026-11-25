import { IMAGE_UPLOAD_LIMITS } from "@sinwy/shared";

export const MAX_IMAGE_SIDE = 2400;

export type ImageEncoding =
	| { type: "image/png" }
	| { type: "image/jpeg"; quality: number };

const JPEG_STEPS: readonly ImageEncoding[] = [
	{ type: "image/jpeg", quality: 0.85 },
	{ type: "image/jpeg", quality: 0.7 },
];

/** The output size and the encodings to try in order until one fits the upload limit. */
export function planImageResize({
	width,
	height,
	type,
}: {
	width: number;
	height: number;
	type: string;
}) {
	const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(width, height));
	return {
		width: Math.max(1, Math.round(width * scale)),
		height: Math.max(1, Math.round(height * scale)),
		encodings:
			type === "image/png"
				? [{ type: "image/png" } as const, ...JPEG_STEPS]
				: JPEG_STEPS,
	};
}

export type ImageShape = "wide" | "square" | "auto";

export const shapeFor = (width: number, height: number): ImageShape => {
	const ratio = width / height;
	if (ratio >= 1.3) return "wide";
	if (ratio < 0.8) return "auto";
	return "square";
};

/** A Photos row keeps one shape: Wide while every photo in it is landscape, otherwise Square. Empty slots don't count. */
export const rowShape = (
	uploaded: ImageShape,
	others: readonly { src?: unknown; aspect?: unknown }[],
): ImageShape =>
	uploaded === "wide" &&
	others.every((other) => !other.src || other.aspect === "wide")
		? "wide"
		: "square";

export type ShrunkImage = { blob: Blob; width: number; height: number };

export type ShrinkResult =
	| ({ ok: true } & ShrunkImage)
	| { ok: false; reason: "unreadable" | "too-large" };

const encode = (canvas: HTMLCanvasElement, encoding: ImageEncoding) =>
	new Promise<Blob | null>((resolve) =>
		canvas.toBlob(
			resolve,
			encoding.type,
			"quality" in encoding ? encoding.quality : undefined,
		),
	);

/** Decodes, scales and re-encodes a picked file, which also drops its EXIF data. */
export async function shrinkImage(file: Blob): Promise<ShrinkResult> {
	let bitmap: ImageBitmap;
	try {
		bitmap = await createImageBitmap(file);
	} catch {
		return { ok: false, reason: "unreadable" };
	}
	try {
		const plan = planImageResize({
			width: bitmap.width,
			height: bitmap.height,
			type: file.type,
		});
		const canvas = document.createElement("canvas");
		canvas.width = plan.width;
		canvas.height = plan.height;
		const context = canvas.getContext("2d");
		if (!context) return { ok: false, reason: "unreadable" };
		for (const encoding of plan.encodings) {
			context.clearRect(0, 0, plan.width, plan.height);
			if (encoding.type === "image/jpeg") {
				context.fillStyle = "#fff";
				context.fillRect(0, 0, plan.width, plan.height);
			}
			context.drawImage(bitmap, 0, 0, plan.width, plan.height);
			const blob = await encode(canvas, encoding);
			if (!blob) return { ok: false, reason: "unreadable" };
			if (blob.size <= IMAGE_UPLOAD_LIMITS.maxBytes)
				return { ok: true, blob, width: plan.width, height: plan.height };
		}
		return { ok: false, reason: "too-large" };
	} finally {
		bitmap.close();
	}
}
