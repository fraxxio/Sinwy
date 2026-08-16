import {
	DEFAULT_ORGANIZATION_INDUSTRY,
	ORGANIZATION_INDUSTRIES,
} from "@sinwy/shared";
import z from "zod";

export const slugify = (name: string) =>
	name
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "") || "org";

// The dashboard lives at /<slug>/*, so a slug matching a top-level path would
// shadow it. Reserving eagerly is the cheap side: a slug already handed out
// can't be taken back when we later want the route.
export const reservedSlugs = new Set([
	"about",
	"account",
	"admin",
	"api",
	"auth",
	"billing",
	"blog",
	"checkout",
	"contact",
	"docs",
	"help",
	"login",
	"organizations",
	"pricing",
	"privacy",
	"settings",
	"signup",
	"support",
	"terms",
]);

export const uniqueSlug = async (
	name: string,
	isTaken: (slug: string) => Promise<boolean>,
) => {
	const base = slugify(name);
	let slug = base;
	// ponytail: 5 attempts is plenty — a 6-char random suffix colliding twice never happens in practice
	for (
		let i = 0;
		i < 5 && (reservedSlugs.has(slug) || (await isTaken(slug)));
		i++
	) {
		slug = `${base}-${Math.random().toString(36).slice(2, 8)}`;
	}
	return slug;
};

export const createOrganizationBody = z.object({
	name: z.string().trim().min(1).max(100),
	industry: z
		.enum(ORGANIZATION_INDUSTRIES)
		.default(DEFAULT_ORGANIZATION_INDUSTRY),
});
