import { describe, expect, it } from "bun:test";
import {
	type ImageEncoding,
	MAX_IMAGE_SIDE,
	planImageResize,
	shapeFor,
} from "../components/page-editor/images";

const JPEG_STEPS: readonly ImageEncoding[] = [
	{ type: "image/jpeg", quality: 0.85 },
	{ type: "image/jpeg", quality: 0.7 },
];

describe("planImageResize", () => {
	it("keeps the size of an image that already fits", () => {
		const plan = planImageResize({
			width: 1200,
			height: 800,
			type: "image/jpeg",
		});
		expect([plan.width, plan.height]).toEqual([1200, 800]);
	});

	it("caps the longest side and keeps the proportions", () => {
		const landscape = planImageResize({
			width: 4000,
			height: 3000,
			type: "image/jpeg",
		});
		expect([landscape.width, landscape.height]).toEqual([MAX_IMAGE_SIDE, 1800]);
		const portrait = planImageResize({
			width: 3024,
			height: 4032,
			type: "image/heic",
		});
		expect([portrait.width, portrait.height]).toEqual([1800, MAX_IMAGE_SIDE]);
	});

	it("keeps a PNG as PNG first, then falls back to JPEG", () => {
		const plan = planImageResize({
			width: 800,
			height: 800,
			type: "image/png",
		});
		expect(plan.encodings).toEqual([{ type: "image/png" }, ...JPEG_STEPS]);
	});

	it("re-encodes everything else as JPEG at 0.85, then 0.7", () => {
		for (const type of ["image/jpeg", "image/webp", "image/gif", "image/avif"])
			expect(
				planImageResize({ width: 800, height: 600, type }).encodings,
			).toEqual(JPEG_STEPS);
	});

	it("never plans a zero-pixel side for an extreme panorama", () => {
		const plan = planImageResize({
			width: 100_000,
			height: 20,
			type: "image/jpeg",
		});
		expect([plan.width, plan.height]).toEqual([MAX_IMAGE_SIDE, 1]);
	});
});

describe("shapeFor", () => {
	it("picks wide from 1.3 up, square from 0.8 up to 1.3 and original below 0.8", () => {
		expect(shapeFor(1300, 1000)).toBe("wide");
		expect(shapeFor(1299, 1000)).toBe("square");
		expect(shapeFor(1000, 1000)).toBe("square");
		expect(shapeFor(800, 1000)).toBe("square");
		expect(shapeFor(799, 1000)).toBe("auto");
	});

	it("handles common photos and an extreme panorama", () => {
		expect(shapeFor(4000, 3000)).toBe("wide");
		expect(shapeFor(3000, 4000)).toBe("auto");
		expect(shapeFor(10_000, 500)).toBe("wide");
	});
});
