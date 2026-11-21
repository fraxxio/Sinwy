import {
	test as base,
	expect,
	type Locator,
	type Page,
} from "@playwright/test";
import type { ApiResponse, PageDetailDto } from "@sinwy/shared";
import { readStack, type SeededOrg, WEB_URL } from "./stack";

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
	create: (blocks?: Block[]) => Promise<string>;
	/** The blocks of the page's latest saved version. */
	saved: (pageId: string) => Promise<Block[]>;
};

export const editorFor = (page: Page, org: SeededOrg) => {
	const canvas = page.locator("iframe#preview-frame").contentFrame();
	const settings = page.getByRole("complementary", { name: "Block settings" });
	return {
		canvas,
		drawer: page.getByRole("complementary", { name: "Blocks" }),
		settings,
		/** The selected block's label, in the settings panel's toolbar. */
		selected: settings.getByRole("heading", { level: 2 }),
		block: (id: string) => canvas.locator(`[data-puck-component="${id}"]`),
		rootZone: canvas.locator('[data-puck-dropzone="root:default-zone"]'),
		button: (name: string) => page.getByRole("button", { name, exact: true }),
		status: (text: "All changes saved" | "Unsaved changes") =>
			page.getByText(text, { exact: true }),

		open: async (pageId: string) => {
			await page.goto(`/dashboard/${org.slug}/pages/${pageId}/edit`);
			await expect(
				canvas.locator('[data-puck-dropzone="root:default-zone"]'),
			).toBeVisible();
			await expect(page.getByText("All changes saved")).toBeVisible();
		},

		/** Clicks the block's own padding, so it's selected rather than a child. */
		select: async (id: string) => {
			await canvas
				.locator(`[data-puck-component="${id}"]`)
				.click({ position: { x: 6, y: 6 } });
		},

		save: async () => {
			await page.getByRole("button", { name: "Save", exact: true }).click();
			await expect(page.getByText("All changes saved")).toBeVisible();
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

export const test = base.extend<{
	plan: "pro" | "starter";
	org: SeededOrg;
	pages: Pages;
	editor: Editor;
}>({
	plan: ["pro", { option: true }],
	org: async ({ plan }, use) => use(readStack()[plan]),
	storageState: async ({ org }, use) => use(org.storageStateFile),

	pages: async ({ page, org }, use) => {
		const call = async <T>(method: string, path: string, data?: unknown) => {
			const res = await page.request.fetch(
				`/api/organizations/${org.orgId}${path}`,
				{ method, headers: ORIGIN, ...(data !== undefined && { data }) },
			);
			const json = (await res.json()) as ApiResponse<T>;
			if (!json.isSuccess)
				throw new Error(`${method} ${path} → ${res.status()} ${json.message}`);
			return json.data;
		};

		await use({
			create: async (blocks) => {
				const slug = `e2e-${crypto.randomUUID().slice(0, 8)}`;
				const created = await call<PageDetailDto>("POST", "/pages", {
					title: `Editor ${slug}`,
					slug,
				});
				if (blocks)
					await call("PUT", `/pages/${created.id}/content`, {
						baseVersion: created.latestVersion.version,
						content: {
							schemaVersion: 2,
							data: { root: { props: {} }, content: blocks },
						},
					});
				return created.id;
			},
			saved: async (pageId) => {
				const detail = await call<PageDetailDto>("GET", `/pages/${pageId}`);
				return detail.latestVersion.content.data.content as Block[];
			},
		});
	},

	editor: async ({ page, org }, use) => use(editorFor(page, org)),
});

export { expect };
