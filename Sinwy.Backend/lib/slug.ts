export const slugify = (name: string, fallback = "org") =>
	name
		.normalize("NFKD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "") || fallback;

export const uniqueSlug = async (
	name: string,
	isTaken: (slug: string) => Promise<boolean>,
	fallback?: string,
) => {
	const base = slugify(name, fallback);
	let slug = base;
	// ponytail: 5 attempts is plenty — a 6-char random suffix colliding twice never happens in practice
	for (let i = 0; i < 5 && (await isTaken(slug)); i++) {
		slug = `${base}-${Math.random().toString(36).slice(2, 8)}`;
	}
	return slug;
};
