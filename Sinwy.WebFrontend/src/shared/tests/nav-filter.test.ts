import { expect, it } from "bun:test";
import type { Permission } from "@sinwy/shared";
import { linkOptions } from "@tanstack/react-router";
import { filterNav } from "../components/shell/nav-filter";
import type { SidebarNavItem } from "../components/shell/SidebarNav";

const link = linkOptions({ to: "/" });

const items: SidebarNavItem[] = [
	{ title: "Overview", icon: null, link },
	{ title: "Team", icon: null, link, permission: "team:manage" },
	{
		title: "Settings",
		icon: null,
		items: [
			{ title: "General", link, permission: "settings:manage" },
			{ title: "Billing", link, permission: "billing:manage" },
		],
	},
];

const titles = (result: SidebarNavItem[]) => result.map((item) => item.title);

const allow =
	(...granted: Permission[]) =>
	(permission: Permission) =>
		granted.includes(permission);

it("keeps everything when every permission is granted", () => {
	expect(filterNav(items, () => true)).toEqual(items);
});

it("always keeps items without a permission", () => {
	expect(titles(filterNav(items, () => false))).toEqual(["Overview"]);
});

it("drops gated items the member cannot use", () => {
	expect(titles(filterNav(items, allow("settings:manage")))).toEqual([
		"Overview",
		"Settings",
	]);
});

it("keeps a group with only its surviving sub-items", () => {
	const [, settings] = filterNav(items, allow("settings:manage"));
	expect(settings?.items?.map((subItem) => subItem.title)).toEqual(["General"]);
});

it("hides a group when all of its sub-items drop", () => {
	expect(titles(filterNav(items, allow("team:manage")))).toEqual([
		"Overview",
		"Team",
	]);
});
