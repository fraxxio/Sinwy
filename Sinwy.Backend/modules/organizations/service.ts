import { auth } from "@authModule";
import { findStatusForMember, isSlugTaken } from "./repository";

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

export const createOrganization = async (userId: string, name: string) => {
	const slug = await uniqueSlug(name, isSlugTaken);
	// server-side system action: no session headers + explicit userId bypasses
	// allowUserToCreateOrganization: false; creator becomes owner
	const org = await auth.api.createOrganization({
		body: { name, slug, userId },
	});
	if (!org) throw new Error("Organization creation failed");
	return { id: org.id, name: org.name, slug: org.slug, status: org.status };
};

export const getOrganizationStatus = async (
	userId: string,
	organizationId: string,
) => {
	// null → org doesn't exist or caller isn't a member (both read as not-found)
	return findStatusForMember(userId, organizationId);
};
