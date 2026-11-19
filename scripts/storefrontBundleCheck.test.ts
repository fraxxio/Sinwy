import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	findEditorCode,
	type Manifest,
	puckRenderFilesIn,
	storefrontRoots,
} from "./storefrontBundleCheck";

const nm = (path: string) => `/repo/node_modules/.bun/pkg/node_modules/${path}`;
const puck = (file: string) => nm(`@puckeditor/core/dist/${file}`);

const manifest = (routeImports: string[]): Manifest => ({
	"client.tsx": {
		file: "assets/index.js",
		isEntry: true,
		imports: ["_react.js"],
		dynamicImports: [
			"src/modules/storefront/routes/$pageSlug.tsx?tsr-split=component",
		],
	},
	"_react.js": { file: "assets/react.js" },
	"src/modules/storefront/routes/$pageSlug.tsx?tsr-split=component": {
		file: "assets/_pageSlug.js",
		src: "src/modules/storefront/routes/$pageSlug.tsx?tsr-split=component",
		isDynamicEntry: true,
		imports: ["_react.js", "_PageDocumentView.js", ...routeImports],
	},
	"_PageDocumentView.js": {
		file: "assets/PageDocumentView.js",
		imports: ["_react.js"],
		dynamicImports: ["Render-H3USS5FU.mjs"],
	},
	"Render-H3USS5FU.mjs": { file: "assets/Render.js", imports: ["_react.js"] },
	"_editor.js": { file: "assets/editor.js", imports: ["_react.js"] },
});

const modules: Record<string, string[]> = {
	"assets/index.js": ["/repo/src/router.tsx"],
	"assets/react.js": [nm("react/index.js")],
	"assets/_pageSlug.js": ["/repo/src/modules/storefront/routes/$pageSlug.tsx"],
	"assets/PageDocumentView.js": [
		"/repo/src/shared/components/page-builder/PageDocumentView.tsx",
		puck("rsc.mjs"),
		puck("chunk-RENDER.mjs"),
	],
	"assets/Render.js": [
		nm("@tiptap/core/dist/index.js"),
		nm("prosemirror-model/dist/index.js"),
	],
	"assets/editor.js": [
		puck("index.mjs"),
		puck("chunk-EDITOR.mjs"),
		nm("@dnd-kit/core/index.js"),
	],
};

const check = (m: Manifest) =>
	findEditorCode({
		manifest: m,
		roots: storefrontRoots(m),
		modulesOf: (file) => modules[file] ?? [],
		puckRenderFiles: new Set(["rsc.mjs", "chunk-RENDER.mjs"]),
	});

describe("findEditorCode", () => {
	test("passes a storefront whose editor code is only imported dynamically", () => {
		expect(check(manifest([]))).toEqual([]);
	});

	test("flags editor code a storefront chunk imports statically", () => {
		expect(check(manifest(["_editor.js"]))).toEqual([
			{
				chunk: "assets/editor.js",
				module: puck("index.mjs"),
				reason: "Puck editor",
			},
			{
				chunk: "assets/editor.js",
				module: puck("chunk-EDITOR.mjs"),
				reason: "Puck editor",
			},
			{
				chunk: "assets/editor.js",
				module: nm("@dnd-kit/core/index.js"),
				reason: "dnd-kit",
			},
		]);
		expect(
			check(manifest(["Render-H3USS5FU.mjs"])).map((f) => f.reason),
		).toEqual(["Tiptap", "ProseMirror"]);
	});

	test("refuses a manifest without the storefront route", () => {
		const {
			"src/modules/storefront/routes/$pageSlug.tsx?tsr-split=component": _,
			...rest
		} = manifest([]);
		expect(() => storefrontRoots(rest)).toThrow("$pageSlug.tsx");
	});
});

describe("puckRenderFilesIn", () => {
	let dist: string;

	beforeEach(async () => {
		dist = await mkdtemp(join(tmpdir(), "sinwy-puck-"));
	});

	afterEach(async () => {
		await rm(dist, { recursive: true, force: true });
	});

	test("follows rsc.mjs's static imports and nothing else", async () => {
		await Bun.write(
			join(dist, "rsc.mjs"),
			'import { a } from "./chunk-A.mjs";\nimport "./chunk-B.mjs";\nconst r = () => import("./Render-X.mjs");',
		);
		await Bun.write(
			join(dist, "chunk-A.mjs"),
			'import {\n  c\n} from "./chunk-C.mjs";',
		);
		await Bun.write(join(dist, "chunk-B.mjs"), "");
		await Bun.write(join(dist, "chunk-C.mjs"), "");
		await Bun.write(join(dist, "index.mjs"), 'import "./chunk-EDITOR.mjs";');

		expect([...(await puckRenderFilesIn(dist))].sort()).toEqual([
			"chunk-A.mjs",
			"chunk-B.mjs",
			"chunk-C.mjs",
			"rsc.mjs",
		]);
	});
});
