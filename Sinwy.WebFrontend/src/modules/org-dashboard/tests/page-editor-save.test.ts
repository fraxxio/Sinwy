import { describe, expect, it } from "bun:test";
import {
	API_ERROR_CODES,
	emptyPageDocument,
	type PageDocument,
} from "@sinwy/shared";
import { getPlanName } from "#/shared/lib/plans";
import {
	hasUnsavedChanges,
	type PageData,
	saveErrorMessage,
	toPageDocument,
} from "../components/page-editor/save";

const page = (): PageData => ({
	root: { props: {} },
	content: [
		{
			type: "Section",
			props: {
				id: "section-1",
				padding: "medium",
				content: [
					{
						type: "Columns",
						props: {
							id: "columns-1",
							columns: "2",
							items: [
								{
									type: "Heading",
									props: { id: "heading-1", text: "Welcome", size: "2" },
								},
							],
						},
					},
				],
			},
		},
	],
});

describe("hasUnsavedChanges", () => {
	it("is false for the same data and for an equal copy", () => {
		const saved = page();
		expect(hasUnsavedChanges(saved, saved)).toBe(false);
		expect(hasUnsavedChanges(page(), saved)).toBe(false);
	});

	it("ignores what isn't stored: Puck's zones and props holding undefined", () => {
		const current = { ...page(), zones: {} } as PageData;
		const heading = (
			current.content[0]?.props["content"] as PageData["content"]
		)[0]?.props["items"] as PageData["content"];
		(heading[0] as { props: Record<string, unknown> }).props["extra"] =
			undefined;
		expect(hasUnsavedChanges(current, page())).toBe(false);
	});

	it("is true for a prop changed deep inside a slot", () => {
		const current = page();
		const columns = (
			current.content[0]?.props["content"] as PageData["content"]
		)[0];
		const heading = (columns?.props["items"] as PageData["content"])[0];
		if (heading) heading.props["text"] = "Welcome in";
		expect(hasUnsavedChanges(current, page())).toBe(true);
	});

	it("is true for a block added or removed", () => {
		expect(hasUnsavedChanges(page(), emptyPageDocument().data)).toBe(true);
		expect(hasUnsavedChanges(emptyPageDocument().data, page())).toBe(true);
	});
});

const withBooking = (): PageDocument =>
	toPageDocument({
		root: { props: {} },
		content: [{ type: "Booking", props: { id: "booking-1" } }],
	});

describe("saveErrorMessage", () => {
	const context = {
		saved: emptyPageDocument(),
		attempted: withBooking(),
		features: [],
	};

	it("tells a version conflict to reload", () => {
		const message = saveErrorMessage(
			{
				code: API_ERROR_CODES.PAGE_VERSION_CONFLICT,
				message: "server text",
			},
			context,
		);
		expect(message).toContain("saved somewhere else");
		expect(message).toContain("Reload");
	});

	it("names the block a 402 is about and the plan that has it", () => {
		expect(
			saveErrorMessage(
				{ code: API_ERROR_CODES.PLAN_UPGRADE_REQUIRED, message: "server text" },
				context,
			),
		).toBe(
			`The Booking block needs the ${getPlanName("professional")} plan. Remove it or upgrade to save.`,
		);
	});

	it("falls back to a general 402 message when no block in the document is locked", () => {
		expect(
			saveErrorMessage(
				{ code: API_ERROR_CODES.PLAN_UPGRADE_REQUIRED, message: "server text" },
				{ ...context, saved: withBooking() },
			),
		).toBe("Your plan doesn't include one of the blocks on this page.");
	});

	it("shows the server's message for anything else, such as a 400", () => {
		expect(
			saveErrorMessage(
				{ code: 400, message: "Section can't hold Hero" },
				context,
			),
		).toBe("Section can't hold Hero");
	});
});
