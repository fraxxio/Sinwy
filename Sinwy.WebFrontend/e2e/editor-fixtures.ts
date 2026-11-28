import {
	test as base,
	expect,
	type Locator,
	type Page,
} from "@playwright/test";
import type { ApiResponse, PageDetailDto } from "@sinwy/shared";
import { readStack, type SeededOrg, type Stack, WEB_URL } from "./stack";

export type Block = {
	type: string;
	props: { id: string } & Record<string, unknown>;
};

export const heading = (id: string, text: string): Block => ({
	type: "Heading",
	props: { id, text, size: "2", align: "start" },
});

export const section = (id: string, items: Block[]): Block => ({
	type: "Section",
	props: { id, tone: "plain", padding: "medium", items },
});

/** A block's id and, for its slot, its children's ids, which is what the assertions compare. */
export const outline = (blocks: Block[]): unknown[] =>
	blocks.map((block) => {
		const items = block.props["items"];
		return Array.isArray(items)
			? { [block.type]: outline(items as Block[]) }
			: block.type;
	});

type Pages = {
	/** A new page in the org, with `blocks` saved as its first version. */
	create: (blocks?: Block[], title?: string) => Promise<string>;
	/** The blocks of the page's latest saved version. */
	saved: (pageId: string) => Promise<Block[]>;
	/** Saves `blocks` as a new version, as another tab would. */
	saveElsewhere: (pageId: string, blocks: Block[]) => Promise<void>;
	/** Publishes the latest version. */
	publish: (pageId: string) => Promise<PageDetailDto>;
	detail: (pageId: string) => Promise<PageDetailDto>;
};

export const editorFor = (page: Page, org: SeededOrg) => {
	const canvas = page.locator("iframe#preview-frame").contentFrame();
	const settings = page.getByRole("complementary", { name: "Block settings" });
	const banner = page.getByRole("banner");
	const status = banner.getByRole("status");
	const drawer = page.getByRole("complementary", { name: "Blocks" });
	return {
		page,
		canvas,
		drawer,
		settings,
		/** The selected block's label, in the settings panel's toolbar. */
		selected: settings.getByRole("heading", { level: 2 }),
		block: (id: string) => canvas.locator(`[data-puck-component="${id}"]`),
		rootZone: canvas.locator('[data-puck-dropzone="root:default-zone"]'),
		button: (name: string) => page.getByRole("button", { name, exact: true }),
		/** The header's way out of the editor, to the page's detail screen. */
		back: page.getByRole("banner").getByText("Back", { exact: true }),
		/** The save status in the header: "Saved", "Saving…" or what went wrong. */
		status,
		/** The toast shown after a delete, with its Undo. */
		deleteToast: page
			.locator('[data-slot="toast"]:not([data-ending-style])')
			.filter({ hasText: /^Deleted / }),
		/** Clicks the Delete icon on the Layers row of the top-level block at `index`. */
		deleteLayer: async (index: number) => {
			await drawer.getByRole("tab", { name: "Layers" }).click();
			const row = drawer
				.getByRole("list")
				.first()
				.locator(":scope > li")
				.nth(index);
			await row.hover();
			await row.getByTitle("Delete", { exact: true }).first().click();
		},
		/** Whether the page is public: "Live", "Changes not live yet", "Draft, not public"… */
		pageState: banner.locator('[data-slot="badge"]'),

		open: async (pageId: string) => {
			await page.goto(`/dashboard/${org.slug}/pages/${pageId}/edit`);
			await expect(
				canvas.locator('[data-puck-dropzone="root:default-zone"]'),
			).toBeVisible();
			await expect(status).toHaveText("Saved");
		},

		/** Clicks the block's own padding, so it's selected rather than a child. */
		select: async (id: string) => {
			await canvas
				.locator(`[data-puck-component="${id}"]`)
				.click({ position: { x: 6, y: 6 } });
		},

		/** Saves at once with the shortcut and waits until everything is saved. */
		save: async () => {
			await page.keyboard.press("ControlOrMeta+s");
			await expect(status).toHaveText("Saved");
		},
	};
};

export type Editor = ReturnType<typeof editorFor>;

type Point = { x: number; y: number };

const centre = async (locator: Locator): Promise<Point> => {
	const box = await locator.boundingBox();
	if (!box) throw new Error(`${locator} has no box`);
	return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

/**
 * A pointer drag the way dnd-kit needs it: small steps, and a 2 px move at the target before the release, without
 * which the drop is cancelled.
 */
export const drag = async (page: Page, from: Locator, to: Point) => {
	await from.scrollIntoViewIfNeeded();
	const start = await centre(from);
	await page.mouse.move(start.x, start.y);
	await page.mouse.down();
	await page.mouse.move(start.x + 10, start.y + 10, { steps: 5 });
	await page.mouse.move(to.x, to.y, { steps: 20 });
	await page.mouse.move(to.x + 2, to.y + 2, { steps: 2 });
	await page.mouse.up();
};

const ORIGIN = { origin: new URL(WEB_URL).origin };

/** Calls the org's API as its owner. */
const orgApi =
	(page: Page, org: SeededOrg) =>
	async <T>(method: string, path: string, data?: unknown) => {
		const res = await page.request.fetch(
			`/api/organizations/${org.orgId}${path}`,
			{ method, headers: ORIGIN, ...(data !== undefined && { data }) },
		);
		const json = (await res.json()) as ApiResponse<T>;
		if (!json.isSuccess)
			throw new Error(`${method} ${path} → ${res.status()} ${json.message}`);
		return json.data;
	};

export const test = base.extend<{
	seed: keyof Stack;
	org: SeededOrg;
	pages: Pages;
	/** Adds an active service to the org and returns its id. */
	addService: (name: string) => Promise<string>;
	editor: Editor;
}>({
	seed: ["pro", { option: true }],
	org: async ({ seed }, use) => use(readStack()[seed]),
	storageState: async ({ org }, use) => use(org.storageStateFile),

	pages: async ({ page, org }, use) => {
		const call = orgApi(page, org);
		const detail = (pageId: string) =>
			call<PageDetailDto>("GET", `/pages/${pageId}`);

		const saveOver = (page: PageDetailDto, blocks: Block[]) =>
			call("PUT", `/pages/${page.id}/content`, {
				baseVersion: page.latestVersion.version,
				content: {
					schemaVersion: 2,
					data: { root: { props: {} }, content: blocks },
				},
			});

		await use({
			create: async (blocks, title) => {
				const slug = `e2e-${crypto.randomUUID().slice(0, 8)}`;
				const created = await call<PageDetailDto>("POST", "/pages", {
					title: title ?? `Editor ${slug}`,
					slug,
				});
				if (blocks) await saveOver(created, blocks);
				return created.id;
			},
			saved: async (pageId) =>
				(await detail(pageId)).latestVersion.content.data.content as Block[],
			saveElsewhere: async (pageId, blocks) => {
				await saveOver(await detail(pageId), blocks);
			},
			publish: async (pageId) =>
				call<PageDetailDto>("POST", `/pages/${pageId}/publish`, {
					baseVersion: (await detail(pageId)).latestVersion.version,
				}),
			detail,
		});
	},

	addService: async ({ page, org }, use) => {
		const call = orgApi(page, org);
		await use(
			async (name) =>
				(
					await call<{ id: string }>("POST", "/services", {
						name,
						durationMinutes: 30,
						priceMinor: 2500,
					})
				).id,
		);
	},

	editor: async ({ page, org }, use) => use(editorFor(page, org)),
});

export { expect };
