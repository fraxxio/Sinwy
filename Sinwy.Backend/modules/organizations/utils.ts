import z from "zod";

export const slugify = (name: string) =>
	name
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "") || "org";

export const uniqueSlug = async (
	name: string,
	isTaken: (slug: string) => Promise<boolean>,
) => {
	const base = slugify(name);
	let slug = base;
	// ponytail: 5 attempts is plenty — a 6-char random suffix colliding twice never happens in practice
	for (let i = 0; i < 5 && (await isTaken(slug)); i++) {
		slug = `${base}-${Math.random().toString(36).slice(2, 8)}`;
	}
	return slug;
};

export const createOrganizationBody = z.object({
	name: z.string().trim().min(1).max(100),
});
