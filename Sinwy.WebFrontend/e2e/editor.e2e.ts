import {
	type Block,
	drag,
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
		await expect(editor.status("Unsaved changes")).toBeVisible();

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
		await expect(editor.status("All changes saved")).toBeVisible();

		await title.click();
		await editor.settings
			.getByLabel("Text", { exact: true })
			.fill("Welcome to the salon");
		await expect(title).toHaveText("Welcome to the salon");
		await expect(editor.status("Unsaved changes")).toBeVisible();

		const phone = editor.button("Phone");
		await phone.click();
		await expect(phone).toHaveAttribute("aria-pressed", "true");

		await editor.button("Undo").click();
		await expect(title).toHaveText("First part");
		await expect(editor.status("All changes saved")).toBeVisible();
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
		await expect(editor.status("All changes saved")).toBeVisible();
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
		// Puck records an edit 250 ms after it; an undo before that has nothing to go back to
		await expect(editor.button("Undo")).toBeEnabled();
		await page.keyboard.press("ControlOrMeta+z");
		await expect(editor.block("first")).toBeVisible();
		await expect(editor.status("All changes saved")).toBeVisible();

		await editor.block("first-title").click();
		await page.keyboard.press("Escape");
		await page.keyboard.press("Alt+ArrowDown");
		await expect(editor.status("Unsaved changes")).toBeVisible();
		await page.keyboard.press("ControlOrMeta+s");
		await expect(editor.status("All changes saved")).toBeVisible();
		const saved = await pages.saved(pageId);
		expect(saved.map((block) => block.props.id)).toEqual(["second", "first"]);
	});
});

test.describe("on Starter", () => {
	test.use({ plan: "starter" });

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
		await expect(editor.status("All changes saved")).toBeVisible();

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
