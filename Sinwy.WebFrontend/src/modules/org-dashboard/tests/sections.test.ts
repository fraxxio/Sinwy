import { expect, it } from "bun:test";
import { organizationNav } from "../lib/nav";
import { ORG_SECTIONS } from "../lib/sections";

const navLinks = organizationNav("acme").flatMap((item) =>
	item.items
		? item.items.map((subItem) => ({
				to: subItem.link.to,
				permission: subItem.permission,
			}))
		: [{ to: item.link.to, permission: item.permission }],
);

it.each(
	Object.entries(ORG_SECTIONS),
)("the %s nav link carries the section's permission", (_key, section) => {
	const link = navLinks.find((candidate) => candidate.to === section.to);
	expect(link?.permission).toBe(section.permission);
});

it("no nav link is gated by a permission outside the sections table", () => {
	const gated = navLinks.filter((link) => link.permission !== undefined);
	expect(gated.map((link) => link.to).sort()).toEqual(
		Object.values(ORG_SECTIONS)
			.map((section) => section.to)
			.sort(),
	);
});
