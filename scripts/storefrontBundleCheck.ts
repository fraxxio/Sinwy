import { rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";

export type ManifestChunk = {
	file: string;
	src?: string;
	isEntry?: boolean;
	isDynamicEntry?: boolean;
	imports?: string[];
	dynamicImports?: string[];
};
export type Manifest = Record<string, ManifestChunk>;
export type Finding = { chunk: string; module: string; reason: string };

const STOREFRONT_ROUTE = "src/modules/storefront/routes/$pageSlug.tsx";
const STOREFRONT_LAYOUT = "src/modules/storefront/routes/route.tsx";

const EDITOR_PACKAGES: [string, RegExp][] = [
	["Tiptap", /\/node_modules\/@tiptap\//],
	["ProseMirror", /\/node_modules\/prosemirror-/],
	["dnd-kit", /\/node_modules\/@dnd-kit\//],
	["react-grid-layout", /\/node_modules\/react-grid-layout\//],
	["happy-dom", /\/node_modules\/happy-dom\//],
];
const PUCK_FILE = /\/node_modules\/@puckeditor\/core\/dist\/([^/]+)$/;
const RENDER_PATH = [PUCK_FILE, /\/src\/shared\/components\/page-builder\//];

export const storefrontRoots = (manifest: Manifest): string[] => {
	const routeOf = (chunk: ManifestChunk) => chunk.src?.split("?")[0];
	const roots = Object.entries(manifest).filter(
		([, chunk]) =>
			chunk.isEntry ||
			routeOf(chunk) === STOREFRONT_ROUTE ||
			routeOf(chunk) === STOREFRONT_LAYOUT,
	);
	if (!roots.some(([, chunk]) => routeOf(chunk) === STOREFRONT_ROUTE)) {
		throw new Error(
			`No chunk in the build manifest comes from ${STOREFRONT_ROUTE}`,
		);
	}
	return roots.map(([key]) => key);
};

export const staticClosure = (
	manifest: Manifest,
	roots: string[],
): string[] => {
	const seen = new Set<string>();
	const queue = [...roots];
	for (let key = queue.pop(); key !== undefined; key = queue.pop()) {
		if (seen.has(key)) continue;
		const chunk = manifest[key];
		if (!chunk) throw new Error(`The build manifest has no chunk ${key}`);
		seen.add(key);
		queue.push(...(chunk.imports ?? []));
	}
	return [...seen];
};

export const editorCodeIn = (
	module: string,
	puckRenderFiles: ReadonlySet<string>,
): string | undefined => {
	for (const [label, pattern] of EDITOR_PACKAGES) {
		if (pattern.test(module)) return label;
	}
	const puckFile = PUCK_FILE.exec(module)?.[1];
	if (puckFile && !puckRenderFiles.has(puckFile)) return "Puck editor";
	return undefined;
};

export const findEditorCode = ({
	manifest,
	roots,
	modulesOf,
	puckRenderFiles,
}: {
	manifest: Manifest;
	roots: string[];
	modulesOf: (file: string) => string[];
	puckRenderFiles: ReadonlySet<string>;
}): Finding[] =>
	staticClosure(manifest, roots).flatMap((key) => {
		const file = manifest[key]?.file ?? key;
		return modulesOf(file).flatMap((module) => {
			const reason = editorCodeIn(module, puckRenderFiles);
			return reason ? [{ chunk: file, module, reason }] : [];
		});
	});

export const puckRenderFilesIn = async (
	puckDist: string,
): Promise<Set<string>> => {
	const files = new Set<string>();
	const queue = ["rsc.mjs"];
	for (let file = queue.pop(); file !== undefined; file = queue.pop()) {
		if (files.has(file)) continue;
		files.add(file);
		const text = await Bun.file(join(puckDist, file)).text();
		for (const [, dep] of text.matchAll(
			/(?:from|import)\s*"\.\/([^"]+\.mjs)"/g,
		)) {
			if (dep) queue.push(dep);
		}
	}
	return files;
};

const MAX_UNMAPPED_BYTES = 4096;

const readModules = async (
	assetsRoot: string,
	file: string,
): Promise<string[]> => {
	const map = Bun.file(join(assetsRoot, `${file}.map`));
	if (await map.exists()) {
		const { sources } = (await map.json()) as { sources: string[] };
		return sources.map((source) => resolve(assetsRoot, file, "..", source));
	}
	if (Bun.file(join(assetsRoot, file)).size <= MAX_UNMAPPED_BYTES) return [];
	throw new Error(`${file} has no source map, so its modules can't be checked`);
};

const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`;

const run = async () => {
	const web = resolve(import.meta.dir, "../Sinwy.WebFrontend");
	const dist = join(web, "dist");
	const client = join(dist, "client");

	const build = Bun.spawnSync(
		["bun", "run", "build", "--manifest", "--sourcemap", "hidden"],
		{
			cwd: web,
			stdout: "pipe",
			stderr: "pipe",
		},
	);
	if (build.exitCode !== 0) {
		process.stdout.write(build.stdout);
		process.stderr.write(build.stderr);
		throw new Error(`vite build exited with ${build.exitCode}`);
	}

	try {
		const manifest = (await Bun.file(
			join(client, ".vite/manifest.json"),
		).json()) as Manifest;
		const roots = storefrontRoots(manifest);
		const files = staticClosure(manifest, roots).map(
			(key) => manifest[key]?.file ?? key,
		);
		const modules = new Map<string, string[]>();
		const gzip = new Map<string, number>();
		for (const file of files) {
			modules.set(file, await readModules(client, file));
			gzip.set(
				file,
				gzipSync(await Bun.file(join(client, file)).bytes()).length,
			);
		}

		const puckRenderFiles = await puckRenderFilesIn(
			join(web, "node_modules/@puckeditor/core/dist"),
		);
		const findings = findEditorCode({
			manifest,
			roots,
			modulesOf: (file) => modules.get(file) ?? [],
			puckRenderFiles,
		});

		const baseline = new Set(
			staticClosure(
				manifest,
				roots.filter((key) => manifest[key]?.isEntry),
			).map((key) => manifest[key]?.file ?? key),
		);
		const routeOnly = files.filter((file) => !baseline.has(file));
		const renderPath = routeOnly.filter((file) =>
			(modules.get(file) ?? []).some((module) =>
				RENDER_PATH.some((p) => p.test(module)),
			),
		);
		const sum = (list: string[]) =>
			list.reduce((total, file) => total + (gzip.get(file) ?? 0), 0);

		console.log(
			`Storefront ${STOREFRONT_ROUTE}, static JS (gzip): ${kb(sum(files))}`,
		);
		console.log(
			`  app entry baseline: ${kb(sum([...baseline]))} in ${baseline.size} chunks`,
		);
		console.log(
			`  storefront route only: ${kb(sum(routeOnly))} in ${routeOnly.length} chunks`,
		);
		console.log(
			`  of which the Puck render path: ${kb(sum(renderPath))} (${renderPath.join(", ")})`,
		);

		if (findings.length > 0) {
			console.error(
				`\nEditor code is statically reachable from the storefront route:`,
			);
			for (const { chunk, module, reason } of findings) {
				console.error(`  ${reason}: ${chunk} holds ${module}`);
			}
			return 1;
		}
		console.log(
			"\nNo editor code is statically reachable from the storefront route.",
		);
		return 0;
	} finally {
		for await (const map of new Bun.Glob("**/*.map").scan({ cwd: dist })) {
			await rm(join(dist, map));
		}
		await rm(join(client, ".vite"), { recursive: true, force: true });
		await rm(join(dist, "server/.vite"), { recursive: true, force: true });
	}
};

if (import.meta.main) {
	process.exit(await run());
}
