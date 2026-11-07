import {
	PAGE_LIMITS,
	type PageListItemDto,
	type PageUsageDto,
	RESERVED_PAGE_SLUGS,
} from "@sinwy/shared";

const reserved: readonly string[] = RESERVED_PAGE_SLUGS;

// letters NFKD leaves whole
const FOLDED: Record<string, string> = {
	ß: "ss",
	æ: "ae",
	œ: "oe",
	ø: "o",
	ł: "l",
	đ: "d",
	ð: "d",
	þ: "th",
};

/** A page address from its title: "Über uns!" → "uber-uns"; a reserved word gets "-page". */
export function slugFromTitle(title: string) {
	const slug = title
		.toLowerCase()
		.replace(/[ßæœøłđðþ]/g, (letter) => FOLDED[letter] ?? letter)
		.normalize("NFKD")
		.replace(/\p{M}/gu, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-/, "")
		.slice(0, PAGE_LIMITS.slug)
		.replace(/-$/, "");
	return reserved.includes(slug) ? `${slug}-page` : slug;
}

export type PageState = "live" | "not-live" | "draft";

export const pageState = (page: Pick<PageListItemDto, "status" | "live">) =>
	page.status === "draft" ? "draft" : page.live ? "live" : "not-live";

export const PAGE_STATE_LABELS: Record<PageState, string> = {
	live: "Published",
	"not-live": "Published, not live",
	draft: "Draft",
};

export const isAtPageLimit = (usage: PageUsageDto) => usage.used >= usage.limit;

/** The public address; the storefront is the organization's homepage. */
export const publicPagePath = (organizationSlug: string, pageSlug: string) =>
	`/${organizationSlug}/${pageSlug}`;
