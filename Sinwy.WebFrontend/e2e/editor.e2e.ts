import type { BrowserContext } from "@playwright/test";
import type { PageDetailDto } from "@sinwy/shared";
import {
	type Block,
	drag,
	type Editor,
	editorFor,
	expect,
	heading,
	outline,
	section,
	test,
} from "./editor-fixtures";

const twoSections = () => [
	section("first", [heading("first-title", "First part")]),
	section("second", [heading("second-title", "Second part")]),
];

const welcome = () => [section("intro", [heading("title", "Welcome")])];

const titleSaved = async (
	pages: { saved: (pageId: string) => Promise<Block[]> },
	pageId: string,
) => {
	const [intro] = await pages.saved(pageId);
	const [title] = (intro?.props["items"] ?? []) as Block[];
	return title?.props["text"];
};

const editTitle = async (editor: Editor, text: string) => {
	await editor.block("title").click();
	await editor.settings.getByLabel("Text", { exact: true }).fill(text);
};

const conflictBanner = (editor: Editor) =>
	editor.page.getByRole("alert").filter({ hasText: "saved somewhere else" });

test.describe("on Professional", () => {
	test("click-to-add places the block where the owner expects and scrolls to it", async ({
		page,
		pages,
		editor,
	}) => {
		const filler = Array.from({ length: 12 }, (_, n) =>
			section(`filler-${n}`, [
				heading(`filler-${n}-title`, `Filler ${n}`),
				heading(`filler-${n}-more`, `More filler ${n}`),
			]),
		);
		const pageId = await pages.create([
			section("intro", [heading("welcome", "Welcome in")]),
			...filler,
			section("find-us", [heading("find-us-title", "Find us")]),
		]);
		await editor.open(pageId);

		await editor.block("welcome").click();
		await expect(editor.selected).toHaveText("Heading");
		await editor.drawer
			.getByRole("button", { name: "Add Image", exact: true })
			.last()
			.click();
		await expect(editor.selected).toHaveText("Image");

		await page.keyboard.press("Escape");
		await page.keyboard.press("Escape");
		await expect(editor.selected).toBeHidden();
		await expect(editor.canvas.getByText("Find us")).not.toBeInViewport();
		await editor.drawer
			.getByRole("button", { name: "Add Booking", exact: true })
			.last()
			.click();
		await expect(editor.selected).toHaveText("Booking");
		await expect(
			editor.canvas.getByText("Book online", { exact: true }),
		).toBeInViewport();

		await editor.save();
		const saved = await pages.saved(pageId);
		expect(outline(saved)).toEqual([
			{ Section: ["Heading", "Image"] },
			...filler.map(() => ({ Section: ["Heading", "Heading"] })),
			{ Section: ["Heading"] },
			"Booking",
		]);
	});

	test("a drawer card dropped at the page end lands last, and a block moves by its handle", async ({
		page,
		pages,
		editor,
	}) => {
		const pageId = await pages.create(twoSections());
		await editor.open(pageId);

		const zone = await editor.rootZone.boundingBox();
		if (!zone) throw new Error("No root zone");
		await drag(page, editor.drawer.getByTestId("drawer-item:Services"), {
			x: zone.x + zone.width / 2,
			y: zone.y + zone.height - 20,
		});
		await expect(editor.canvas.getByText("Our services")).toBeVisible();

		await editor.select("second");
		await expect(editor.selected).toHaveText("Section");
		const handle = editor.canvas.locator("[data-puck-drag-handle]");
		await expect(handle).toHaveCount(1);
		const first = await editor.block("first").boundingBox();
		if (!first) throw new Error("No first section");
		await drag(page, handle, {
			x: first.x + first.width / 2,
			y: first.y + first.height / 4,
		});
		await expect(
			editor.canvas.locator(
				'[data-puck-component="second"] ~ [data-puck-component="first"]',
			),
		).toHaveCount(1);

		await editor.save();
		const saved = await pages.saved(pageId);
		expect(saved.map((block) => block.props.id).slice(0, 2)).toEqual([
			"second",
			"first",
		]);
		expect(outline(saved)).toEqual([
			{ Section: ["Heading"] },
			{ Section: ["Heading"] },
			"Services",
		]);
	});

	test("a field edit undoes and redoes on the phone view and survives save and reload", async ({
		page,
		pages,
		editor,
	}) => {
		const pageId = await pages.create(twoSections());
		await editor.open(pageId);
		const title = editor.block("first-title");

		await title.click();
		await editor.select("second");
		await expect(editor.button("Undo")).toBeDisabled();
		await expect(editor.status).toHaveText("Saved");

		await title.click();
		await editor.settings
			.getByLabel("Text", { exact: true })
			.fill("Welcome to the salon");
		await expect(title).toHaveText("Welcome to the salon");

		const phone = editor.button("Phone");
		await phone.click();
		await expect(phone).toHaveAttribute("aria-pressed", "true");

		await editor.button("Undo").click();
		await expect(title).toHaveText("First part");
		await editor.button("Redo").click();
		await expect(title).toHaveText("Welcome to the salon");

		await editor.block("second-title").click();
		await page.keyboard.press("ControlOrMeta+z");
		await expect(title).toHaveText("First part");
		await page.keyboard.press("ControlOrMeta+Shift+z");
		await expect(title).toHaveText("Welcome to the salon");
		await expect(phone).toHaveAttribute("aria-pressed", "true");

		await editor.save();
		await page.reload();
		await expect(editor.block("first-title")).toHaveText(
			"Welcome to the salon",
		);
		await expect(editor.status).toHaveText("Saved");
		const [first] = await pages.saved(pageId);
		const [saved] = (first?.props["items"] ?? []) as Block[];
		expect(saved?.props["text"]).toBe("Welcome to the salon");
	});

	test("the keyboard selects, moves, deletes, undoes and saves", async ({
		page,
		pages,
		editor,
	}) => {
		const pageId = await pages.create(twoSections());
		await editor.open(pageId);

		await editor.block("first-title").click();
		await expect(editor.selected).toHaveText("Heading");
		await page.keyboard.press("Escape");
		await expect(editor.selected).toHaveText("Section");
		await page.keyboard.press("ArrowDown");
		await expect(editor.selected).toHaveText("Heading");
		await page.keyboard.press("Escape");
		await expect(editor.selected).toHaveText("Section");

		await page.keyboard.press("Delete");
		await expect(editor.block("first")).toHaveCount(0);
		// Puck records the delete 250 ms after it; an undo pressed at once waits for that
		await page.keyboard.press("ControlOrMeta+z");
		await expect(editor.block("first")).toBeVisible();

		await editor.block("first-title").click();
		await page.keyboard.press("Escape");
		await page.keyboard.press("Alt+ArrowDown");
		await editor.save();
		const saved = await pages.saved(pageId);
		expect(saved.map((block) => block.props.id)).toEqual(["second", "first"]);
	});

	test("a save refused for a newer version stops autosave and keeps the edits", async ({
		page,
		pages,
		editor,
	}) => {
		const pageId = await pages.create(twoSections());
		await editor.open(pageId);
		await pages.saveElsewhere(pageId, [
			section("elsewhere", [heading("elsewhere-title", "From another tab")]),
		]);

		const title = editor.block("first-title");
		await title.click();
		const textField = editor.settings.getByLabel("Text", { exact: true });
		await textField.fill("Welcome to the salon");
		await expect(conflictBanner(editor)).toBeVisible();
		await expect(editor.status).toHaveText("Not saved");

		let puts = 0;
		page.on("request", (request) => {
			if (request.method() === "PUT") puts += 1;
		});
		await textField.fill("Welcome to the salon today");
		await page.keyboard.press("ControlOrMeta+s");
		await page.waitForTimeout(1500);
		expect(puts).toBe(0);
		await expect(title).toHaveText("Welcome to the salon today");
		const [saved] = await pages.saved(pageId);
		expect(saved?.props.id).toBe("elsewhere");
	});
});

test.describe("on Starter", () => {
	test.use({ seed: "starter" });

	test("Booking is a locked tile that explains the upgrade and can't be dragged in", async ({
		page,
		pages,
		editor,
	}) => {
		const pageId = await pages.create();
		await editor.open(pageId);
		const firstRun = editor.canvas.getByRole("button", {
			name: "Add Hero",
			exact: true,
		});
		await expect(firstRun).toBeVisible();

		const locked = editor.drawer.getByRole("button", {
			name: "Booking: upgrade to use",
		});
		const zone = await editor.rootZone.boundingBox();
		if (!zone) throw new Error("No root zone");
		await drag(page, locked, {
			x: zone.x + zone.width / 2,
			y: zone.y + zone.height / 2,
		});
		await expect(firstRun).toBeVisible();
		await expect(editor.status).toHaveText("Saved");

		await locked.click();
		const dialog = page.getByRole("dialog");
		await expect(
			dialog.getByText("Booking comes with the Business plan"),
		).toBeVisible();
		await expect(
			dialog.getByRole("button", { name: "Upgrade plan" }),
		).toHaveAttribute("href", /\/account\/billing\?change=plan/);
		await page.keyboard.press("Escape");
		await expect(dialog).toBeHidden();

		await firstRun.click();
		await expect(editor.selected).toHaveText("Hero");
		await expect(firstRun).toHaveCount(0);
		await editor.save();
		expect(outline(await pages.saved(pageId))).toEqual([
			{ Hero: ["Heading", "RichText", "Button"] },
		]);
	});
});

test.describe("autosave", () => {
	test.use({ seed: "secondPro" });

	test("a save in another tab pauses autosave until the owner keeps theirs or loads the latest", async ({
		page,
		context,
		org,
		pages,
		editor,
	}) => {
		const pageId = await pages.create(welcome());
		const savedTitle = () => titleSaved(pages, pageId);
		const other = editorFor(await context.newPage(), org);
		await editor.open(pageId);
		await other.open(pageId);

		await editTitle(other, "From tab B");
		await expect.poll(savedTitle).toBe("From tab B");
		await editTitle(editor, "From tab A");
		const banner = conflictBanner(editor);
		await expect(banner).toBeVisible();
		await expect(editor.status).toHaveText("Not saved");
		expect(await savedTitle()).toBe("From tab B");

		await banner.getByRole("button", { name: "Keep mine" }).click();
		await expect(banner).toBeHidden();
		await expect(editor.status).toHaveText("Saved");
		expect(await savedTitle()).toBe("From tab A");

		await other.open(pageId);
		await editTitle(other, "Tab B again");
		await expect.poll(savedTitle).toBe("Tab B again");
		await editTitle(editor, "Tab A again");
		await expect(banner).toBeVisible();
		await banner.getByRole("button", { name: "Load latest" }).click();
		await page
			.getByRole("alertdialog")
			.getByRole("button", { name: "Load latest" })
			.click();
		await expect(editor.block("title")).toHaveText("Tab B again");
		await expect(editor.status).toHaveText("Saved");
		expect(await savedTitle()).toBe("Tab B again");
	});

	test("Back straight after typing saves the edit and leaves with no prompt", async ({
		page,
		pages,
		editor,
	}) => {
		const pageId = await pages.create(welcome());
		await editor.open(pageId);

		await editTitle(editor, "Welcome to the salon");
		await expect(editor.status).toHaveText("Saving…");
		await editor.back.click();
		await expect(page).toHaveURL(new RegExp(`/pages/${pageId}$`));
		await expect(page.getByRole("alertdialog")).toHaveCount(0);
		expect(await titleSaved(pages, pageId)).toBe("Welcome to the salon");
	});

	test("Back with a save that can't go through asks first, and Cancel keeps the edits", async ({
		page,
		pages,
		editor,
	}) => {
		const pageId = await pages.create(welcome());
		await editor.open(pageId);
		const content = `**/pages/${pageId}/content`;
		await page.route(content, (route) =>
			route.request().method() === "PUT" ? route.abort() : route.continue(),
		);

		await editTitle(editor, "Welcome to the salon");
		await editor.back.click();
		const prompt = page.getByRole("alertdialog");
		await expect(prompt).toContainText("Leave without saving?");
		await prompt.getByRole("button", { name: "Cancel" }).click();
		await expect(prompt).toBeHidden();
		await expect(page).toHaveURL(/\/edit$/);
		await expect(editor.block("title")).toHaveText("Welcome to the salon");

		await page.unroute(content);
		await editor.button("Retry now").click();
		await expect(editor.status).toHaveText("Saved");
		expect(await titleSaved(pages, pageId)).toBe("Welcome to the salon");
	});

	test("an edit saves with no click and survives a reload, and Ctrl+S saves what was just typed", async ({
		page,
		pages,
		editor,
	}) => {
		const pageId = await pages.create(welcome());
		await editor.open(pageId);
		const textField = editor.settings.getByLabel("Text", { exact: true });
		const savedTitle = () => titleSaved(pages, pageId);

		await editor.block("title").click();
		await textField.fill("Welcome to the salon");
		await expect(editor.status).toHaveText("Saving…");
		await expect(editor.status).toHaveText("Saved");
		expect(await savedTitle()).toBe("Welcome to the salon");

		await page.reload();
		await expect(editor.block("title")).toHaveText("Welcome to the salon");
		await expect(editor.status).toHaveText("Saved");

		await editor.block("title").click();
		await textField.press("End");
		await textField.pressSequentially(" today");
		// Autosave waits a second after the last key; the shortcut doesn't
		const put = page.waitForRequest(
			(request) =>
				request.method() === "PUT" &&
				request.postData()?.includes("Welcome to the salon today") === true,
			{ timeout: 500 },
		);
		await page.keyboard.press("ControlOrMeta+s");
		await put;
		await expect(editor.status).toHaveText("Saved");
		await expect(page.getByText("Changes saved")).toHaveCount(0);
		expect(await savedTitle()).toBe("Welcome to the salon today");
	});
});

test.describe("publishing", () => {
	test.use({ seed: "thirdPro" });

	/** The page as customers see it, in a tab of its own. */
	const storefront = async (
		context: BrowserContext,
		pages: { detail: (pageId: string) => Promise<PageDetailDto> },
		org: { slug: string },
		pageId: string,
	) => {
		const tab = await context.newPage();
		const path = `/${org.slug}/${(await pages.detail(pageId)).slug}`;
		return {
			path,
			heading: async () => {
				await tab.goto(path);
				return tab.getByRole("heading", { level: 2 }).first().textContent();
			},
		};
	};

	test("Publish straight after an edit publishes that edit and links to the live page", async ({
		context,
		org,
		pages,
		editor,
	}) => {
		const pageId = await pages.create(welcome());
		const live = await storefront(context, pages, org, pageId);
		await editor.open(pageId);
		await expect(editor.pageState).toHaveText("Draft, not public");
		await editor.button("Publish").click();
		await expect(editor.pageState).toHaveText("Live");
		expect(await live.heading()).toBe("Welcome");

		await editTitle(editor, "Welcome to the salon");
		await expect(editor.pageState).toHaveText("Changes not live yet");
		await editor.button("Publish changes").click();
		await expect(editor.page.getByText("Changes published")).toBeVisible();
		await expect(editor.pageState).toHaveText("Live");
		await expect(editor.button("Publish changes")).toBeHidden();
		await expect(
			editor.page.getByRole("banner").getByRole("link", { name: live.path }),
		).toHaveAttribute("href", live.path);
		expect(await live.heading()).toBe("Welcome to the salon");
		expect(await titleSaved(pages, pageId)).toBe("Welcome to the salon");
	});

	test("Undo back to what's live shows Live; Discard restores what's live, and the live page doesn't change", async ({
		page,
		context,
		org,
		pages,
		editor,
	}) => {
		const pageId = await pages.create(welcome());
		const pinned = (await pages.publish(pageId)).latestVersion.version;
		const live = await storefront(context, pages, org, pageId);
		await editor.open(pageId);
		await expect(editor.pageState).toHaveText("Live");

		await editTitle(editor, "Oops");
		await expect.poll(() => titleSaved(pages, pageId)).toBe("Oops");
		await expect(editor.pageState).toHaveText("Changes not live yet");
		await editor.button("Undo").click();
		await expect.poll(() => titleSaved(pages, pageId)).toBe("Welcome");
		await expect(editor.status).toHaveText("Saved");
		await expect(editor.pageState).toHaveText("Live");

		await editTitle(editor, "Not ready yet");
		await expect(editor.status).toHaveText("Saved");
		await expect(editor.pageState).toHaveText("Changes not live yet");
		expect(await live.heading()).toBe("Welcome");

		await editor.button("Discard changes").click();
		const confirm = page.getByRole("alertdialog");
		await expect(confirm).toContainText("undo history");
		await confirm.getByRole("button", { name: "Discard changes" }).click();
		await expect(editor.block("title")).toHaveText("Welcome");
		await expect(editor.pageState).toHaveText("Live");
		await expect(editor.status).toHaveText("Saved");
		await expect(editor.button("Discard changes")).toBeHidden();

		const after = await pages.detail(pageId);
		expect(await titleSaved(pages, pageId)).toBe("Welcome");
		expect(after.hasUnpublishedChanges).toBe(false);
		expect(after.publishedVersion).toBeGreaterThan(pinned);
		expect(await live.heading()).toBe("Welcome");
	});

	test("Publish warns about empty photos and sample text, shows the block, and publishes anyway", async ({
		page,
		pages,
		editor,
	}) => {
		const photo = (id: string): Block => ({
			type: "Image",
			props: { id, src: "", alt: "", aspect: "square" },
		});
		const pageId = await pages.create([
			section("intro", [heading("title", "Heading")]),
			{
				type: "Photos",
				props: {
					id: "photos",
					gap: "medium",
					phoneLayout: "stack",
					items: [photo("photo-1"), photo("photo-2")],
				},
			},
		]);
		await editor.open(pageId);
		const dialog = page.getByRole("alertdialog");
		const rows = dialog.getByRole("listitem");

		await editor.button("Publish").click();
		await expect(rows).toHaveText([
			/^Heading in Section · Still has its sample text/,
			/^Image 1 in Photos · Has no photo/,
			/^Image 2 in Photos · Has no photo/,
		]);
		await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
		await rows.nth(1).getByRole("button", { name: "Show" }).click();
		await expect(dialog).toBeHidden();
		await expect(editor.selected).toHaveText("Image");
		await expect(editor.block("photo-1")).toBeInViewport();
		await expect(editor.pageState).toHaveText("Draft, not public");

		await editor.button("Publish").click();
		await dialog.getByRole("button", { name: "Publish anyway" }).click();
		await expect(editor.pageState).toHaveText("Live");
		await expect(dialog).toBeHidden();

		await editTitle(editor, "Our work");
		await expect(editor.status).toHaveText("Saved");
		await editor.back.click();
		await expect(
			page.getByRole("heading", { name: "Publishing" }),
		).toBeVisible();
		await page.getByRole("button", { name: "Publish changes" }).click();
		await expect(rows).toHaveText([/Has no photo$/, /Has no photo$/]);
		await expect(dialog.getByRole("button", { name: "Show" })).toHaveCount(0);
		await expect(
			dialog.getByRole("link", { name: "Open the editor" }),
		).toBeVisible();
		await dialog.getByRole("button", { name: "Publish anyway" }).click();
		await expect(page.getByText("Changes published")).toBeVisible();
		expect((await pages.detail(pageId)).hasUnpublishedChanges).toBe(false);
	});

	test("Discard on the detail page drops a draft saved earlier", async ({
		page,
		org,
		pages,
	}) => {
		const pageId = await pages.create(welcome());
		await pages.publish(pageId);
		await pages.saveElsewhere(pageId, [
			section("intro", [heading("title", "Draft only")]),
		]);
		await page.goto(`/dashboard/${org.slug}/pages/${pageId}`);

		await page.getByRole("button", { name: "Discard changes" }).click();
		await page
			.getByRole("alertdialog")
			.getByRole("button", { name: "Discard changes" })
			.click();
		await expect(page.getByText("Changes discarded")).toBeVisible();
		await expect(
			page.getByRole("button", { name: "Discard changes" }),
		).toBeHidden();
		expect(await titleSaved(pages, pageId)).toBe("Welcome");
	});
});
