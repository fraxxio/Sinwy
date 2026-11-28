import type { BrowserContext, Page } from "@playwright/test";
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

test.describe("deleting", () => {
	test.use({ seed: "deleting" });

	const photo = (id: string): Block => ({
		type: "Image",
		props: { id, src: "", alt: "", aspect: "square" },
	});
	const salonPage = () => [
		section("salon", [
			heading("salon-title", "Inside the salon"),
			{
				type: "Photos",
				props: {
					id: "salon-photos",
					gap: "medium",
					phoneLayout: "stack",
					items: [photo("photo-1"), photo("photo-2")],
				},
			},
		]),
		section("find", [heading("find-title", "Find us")]),
	];
	const savedIds = async (
		pages: { saved: (pageId: string) => Promise<Block[]> },
		pageId: string,
	) => (await pages.saved(pageId)).map((block) => block.props.id);

	const expectSalonToast = async (editor: Editor) => {
		await expect(editor.deleteToast).toContainText(
			"Deleted Section · Inside the salon",
		);
		await expect(editor.deleteToast).toContainText(
			"With 2 photos and 1 more block inside",
		);
	};

	test("Undo in the toast brings back a deleted section with its photos, and the restore saves", async ({
		pages,
		editor,
	}) => {
		const pageId = await pages.create(salonPage());
		await editor.open(pageId);
		const before = await pages.saved(pageId);

		await editor.select("salon");
		await editor.canvas
			.getByRole("button", { name: "Delete", exact: true })
			.click();
		await expect(editor.block("salon")).toHaveCount(0);
		await expectSalonToast(editor);
		await expect.poll(() => savedIds(pages, pageId)).toEqual(["find"]);

		await editor.deleteToast.getByRole("button", { name: "Undo" }).click();
		await expect(editor.deleteToast).toHaveCount(0);
		await expect(editor.block("photo-2")).toBeVisible();
		await expect.poll(() => pages.saved(pageId)).toEqual(before);
	});

	test("the settings panel, the Layers row and the Delete key show the same toast", async ({
		page,
		pages,
		editor,
	}) => {
		const pageId = await pages.create(salonPage());
		await editor.open(pageId);
		const undo = async () => {
			await editor.deleteToast.getByRole("button", { name: "Undo" }).click();
			await expect(editor.block("salon")).toBeVisible();
		};

		await editor.select("salon");
		await editor.settings
			.getByRole("button", { name: "Delete", exact: true })
			.click();
		await expectSalonToast(editor);
		await undo();

		await editor.select("find");
		await expect(editor.selected).toHaveText("Section");
		await editor.deleteLayer(0);
		await expect(editor.block("salon")).toHaveCount(0);
		await expectSalonToast(editor);
		await expect(
			editor.settings.getByText("Select a block on the page"),
		).toBeVisible();
		await undo();

		await editor.select("salon");
		await page.keyboard.press("Delete");
		await expectSalonToast(editor);
		await undo();

		await editor.block("find-title").click();
		await page.keyboard.press("Delete");
		await expect(editor.deleteToast).toHaveText(/^Deleted Heading in Find us/);
		await expect(editor.deleteToast).not.toContainText("With ");
	});

	test("the toast closes on the next edit and on Ctrl+Z, so its Undo never takes back anything else", async ({
		page,
		pages,
		editor,
	}) => {
		const pageId = await pages.create(salonPage());
		await editor.open(pageId);

		await editor.select("salon");
		await page.keyboard.press("Delete");
		await expect(editor.deleteToast).toBeVisible();
		await editor.block("find-title").click();
		await editor.settings
			.getByLabel("Text", { exact: true })
			.fill("Where to find us");
		await expect(editor.deleteToast).toHaveCount(0);
		// an edit and a delete less than 250 ms apart are one undo step
		await expect
			.poll(async () => JSON.stringify(await pages.saved(pageId)))
			.toContain("Where to find us");

		await editor.select("find");
		await page.keyboard.press("Delete");
		await expect(editor.deleteToast).toBeVisible();
		await page.keyboard.press("ControlOrMeta+z");
		await expect(editor.deleteToast).toHaveCount(0);
		await expect(editor.block("find")).toHaveCount(1);
		await expect(editor.block("find-title")).toHaveText("Where to find us");
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

	test("Publish on the detail page after a save elsewhere refuses once, then publishes the newer draft", async ({
		page,
		context,
		org,
		pages,
	}) => {
		const pageId = await pages.create(welcome());
		await pages.publish(pageId);
		await pages.saveElsewhere(pageId, [
			section("intro", [heading("title", "First draft")]),
		]);
		await page.goto(`/dashboard/${org.slug}/pages/${pageId}`);
		const publish = page.getByRole("button", { name: "Publish changes" });
		await expect(publish).toBeVisible();
		await pages.saveElsewhere(pageId, [
			section("intro", [heading("title", "Second draft")]),
		]);

		await publish.click();
		await expect(
			page.getByText("This page changed somewhere else"),
		).toBeVisible();
		await publish.click();
		await expect(page.getByText("Changes published")).toBeVisible();
		const live = await storefront(context, pages, org, pageId);
		expect(await live.heading()).toBe("Second draft");
	});
});

test.describe("photos", () => {
	test.use({ seed: "photos" });

	const emptyPhoto = (id: string): Block => ({
		type: "Image",
		props: { id, src: "", alt: "", aspect: "square" },
	});

	/** A JPEG drawn in the browser, so no binary fixture has to live in the repo. */
	const jpeg = async (
		page: Page,
		width: number,
		height: number,
	): Promise<Buffer> => {
		const base64 = await page.evaluate(
			([w, h]) => {
				const canvas = document.createElement("canvas");
				canvas.width = w;
				canvas.height = h;
				const context = canvas.getContext("2d");
				if (!context) throw new Error("no 2d context");
				const gradient = context.createLinearGradient(0, 0, w, h);
				gradient.addColorStop(0, "#c084fc");
				gradient.addColorStop(1, "#f59e0b");
				context.fillStyle = gradient;
				context.fillRect(0, 0, w, h);
				return canvas.toDataURL("image/jpeg", 0.9).split(",")[1] ?? "";
			},
			[width, height] as const,
		);
		return Buffer.from(base64, "base64");
	};

	test("a photo from the device fills an Image with a fitting shape in one undo step, the Photos row keeps one shape, and a text file is refused", async ({
		page,
		pages,
		editor,
		org,
	}) => {
		const pageId = await pages.create([
			{
				type: "Photos",
				props: {
					id: "photos",
					gap: "medium",
					phoneLayout: "stack",
					items: [emptyPhoto("photo-1"), emptyPhoto("photo-2")],
				},
			},
		]);
		await editor.open(pageId);
		const stored = new RegExp(`/api/files/pages/${org.orgId}/[^/]+\\.jpg$`);
		const photo = editor.block("photo-1").locator("img");
		const shape = editor.settings.getByRole("combobox", { name: "Shape" });
		const fileInput = editor.settings.getByLabel("Upload photo");

		await editor.block("photo-1").click();
		await expect(editor.selected).toHaveText("Image");
		await expect(
			editor.settings.getByText("Describe the photo for people"),
		).toBeHidden();
		await fileInput.setInputFiles({
			name: "salon.jpg",
			mimeType: "image/jpeg",
			buffer: await jpeg(page, 1600, 900),
		});
		await expect(photo).toHaveAttribute("src", stored);
		await expect(shape).toContainText("Wide");
		await expect(
			editor.settings.getByText("Describe the photo for people"),
		).toBeVisible();

		await editor.button("Undo").click();
		await expect(photo).toHaveCount(0);
		await expect(shape).toContainText("Square");
		await editor.button("Redo").click();
		await expect(photo).toHaveAttribute("src", stored);
		await expect(shape).toContainText("Wide");

		await fileInput.setInputFiles({
			name: "notes.txt",
			mimeType: "text/plain",
			buffer: Buffer.from("not a photo"),
		});
		await expect(editor.settings.getByRole("alert")).toHaveText(
			/can't be read as a photo/,
		);
		await expect(photo).toHaveAttribute("src", stored);

		await editor.block("photo-2").click();
		await expect(shape).toContainText("Wide");
		await fileInput.setInputFiles({
			name: "chair.jpg",
			mimeType: "image/jpeg",
			buffer: await jpeg(page, 900, 1200),
		});
		await expect(editor.block("photo-2").locator("img")).toHaveAttribute(
			"src",
			stored,
		);
		await expect(shape).toContainText("Square");

		await editor.save();
		const [photos] = await pages.saved(pageId);
		const [first, second] = (photos?.props["items"] ?? []) as Block[];
		expect(first?.props["src"]).toMatch(stored);
		expect(second?.props["src"]).toMatch(stored);
		expect(first?.props["aspect"]).toBe("square");
		expect(second?.props["aspect"]).toBe("square");
		expect(JSON.stringify(photos)).not.toMatch(/blob:|data:/);
	});

	/** Holds photo uploads at the network until `release` is called. */
	const holdUploads = async (page: Page) => {
		const gate = Promise.withResolvers<void>();
		await page.route("**/page-images", async (route) => {
			await gate.promise;
			await route.continue().catch(() => {});
		});
		return gate.resolve;
	};

	test("Publish during an upload waits for it and publishes the photo", async ({
		page,
		pages,
		editor,
		org,
	}) => {
		const pageId = await pages.create([
			section("gallery", [emptyPhoto("photo-1")]),
		]);
		await editor.open(pageId);
		const release = await holdUploads(page);

		await editor.select("photo-1");
		await editor.settings.getByLabel("Upload photo").setInputFiles({
			name: "salon.jpg",
			mimeType: "image/jpeg",
			buffer: await jpeg(page, 1200, 900),
		});
		await expect(editor.status).toHaveText("Uploading…");
		await editor.button("Publish").click();
		await expect(editor.button("Publishing…")).toBeVisible();
		release();

		await expect(page.getByText("Page published")).toBeVisible();
		await expect(page.getByRole("alertdialog")).toHaveCount(0);
		await expect(editor.status).toHaveText("Saved");
		const detail = await pages.detail(pageId);
		expect(detail.publishedVersion).toBe(detail.latestVersion.version);
		expect(JSON.stringify(detail.latestVersion.content.data)).toMatch(
			new RegExp(`"src":"[^"]*/api/files/pages/${org.orgId}/[^/"]+\\.jpg"`),
		);
	});

	test("Back during an upload asks: Wait stays with the upload shown, Leave anyway drops it", async ({
		page,
		pages,
		editor,
	}) => {
		const pageId = await pages.create([
			section("gallery", [emptyPhoto("photo-1"), emptyPhoto("photo-2")]),
		]);
		await editor.open(pageId);
		const release = await holdUploads(page);

		await editor.select("photo-1");
		await editor.settings.getByLabel("Upload photo").setInputFiles({
			name: "salon.jpg",
			mimeType: "image/jpeg",
			buffer: await jpeg(page, 900, 1200),
		});
		await expect(editor.status).toHaveText("Uploading…");
		await editor.select("photo-2");
		await expect(editor.settings.getByText("Uploading…")).toBeHidden();
		await editor.select("photo-1");
		await expect(editor.settings.getByText("Uploading…")).toBeVisible();

		await editor.back.click();
		const prompt = page.getByRole("alertdialog");
		await expect(prompt).toContainText("A photo is still uploading");
		await prompt.getByRole("button", { name: "Wait" }).click();
		await expect(prompt).toBeHidden();
		await expect(page).toHaveURL(/\/edit$/);
		await expect(editor.status).toHaveText("Uploading…");

		await editor.back.click();
		await prompt.getByRole("button", { name: "Leave anyway" }).click();
		await expect(page).not.toHaveURL(/\/edit$/);
		release();

		expect(JSON.stringify(await pages.saved(pageId))).not.toMatch(
			/"src":"[^"]/,
		);
	});
});

test.describe("links", () => {
	test.use({ seed: "links" });

	test("a Button opens one service's booking and another opens another page, all by clicks, and the live page links to both", async ({
		page,
		context,
		org,
		pages,
		addService,
		editor,
	}) => {
		await addService("Beard trim");
		const colouring = await addService("Colouring");
		const aboutId = await pages.create(
			[section("about", [heading("about-title", "About the salon")])],
			"About us",
		);
		await pages.publish(aboutId);
		const homeId = await pages.create(welcome());
		await editor.open(homeId);

		const linkOpens = editor.settings.getByRole("combobox", {
			name: "Link opens",
		});
		const choose = async (combobox: string, option: string) => {
			await editor.settings
				.getByRole("combobox", { name: combobox, exact: true })
				.click();
			await page.getByRole("option", { name: option, exact: true }).click();
		};
		const addButton = async (label: string) => {
			await editor.drawer
				.getByRole("button", { name: "Add Button", exact: true })
				.last()
				.click();
			await expect(editor.selected).toHaveText("Button");
			await editor.settings.getByLabel("Label", { exact: true }).fill(label);
		};

		await editor.block("title").click();
		await addButton("Book colouring");
		await choose("Link opens", "One service's booking");
		await choose("Service", "Colouring");
		await expect(linkOpens).toContainText("Booking: Colouring");

		await addButton("About the salon");
		await choose("Link opens", "Another page");
		await choose("Page", "About us");
		await expect(linkOpens).toContainText("Another page: About us");

		await editor.save();
		const [intro] = await pages.saved(homeId);
		const [, booking, about] = (intro?.props["items"] ?? []) as Block[];
		expect(outline(intro ? [intro] : [])).toEqual([
			{ Section: ["Heading", "Button", "Button"] },
		]);
		expect(booking?.props["href"]).toBe(`book?service=${colouring}`);
		expect(about?.props["href"]).toBe(`page:${aboutId}`);

		await page.reload();
		await expect(editor.status).toHaveText("Saved");
		await editor.select(booking?.props.id ?? "");
		await expect(linkOpens).toContainText("Booking: Colouring");
		await editor.select(about?.props.id ?? "");
		await expect(linkOpens).toContainText("Another page: About us");

		await editor.button("Publish").click();
		await expect(editor.pageState).toHaveText("Live");
		const live = await context.newPage();
		const home = await pages.detail(homeId);
		const aboutSlug = (await pages.detail(aboutId)).slug;
		await live.goto(`/${org.slug}/${home.slug}`);
		await expect(
			live.getByRole("link", { name: "Book colouring" }),
		).toHaveAttribute("href", `/${org.slug}/book?service=${colouring}`);
		await expect(
			live.getByRole("link", { name: "About the salon" }),
		).toHaveAttribute("href", `/${org.slug}/${aboutSlug}`);
	});
});
