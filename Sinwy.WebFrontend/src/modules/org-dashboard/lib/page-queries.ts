import type {
	CreatePageInput,
	OrganizationOnboardingDto,
	PageDetailDto,
	PageListDto,
	UpdatePageInput,
} from "@sinwy/shared";
import { type QueryClient, queryOptions } from "@tanstack/react-query";
import { api } from "#/shared/lib/api";

export const pageKeys = {
	all: (organizationId: string) => ["pages", organizationId] as const,
	list: (organizationId: string) =>
		[...pageKeys.all(organizationId), "list"] as const,
	detail: (organizationId: string, pageId: string) =>
		[...pageKeys.all(organizationId), "detail", pageId] as const,
};

const pagesPath = (organizationId: string, suffix = "") =>
	`/organizations/${organizationId}/pages${suffix}`;

export const pagesQuery = (organizationId: string) =>
	queryOptions({
		queryKey: pageKeys.list(organizationId),
		queryFn: async () => {
			const res = await api<PageListDto>(pagesPath(organizationId));
			if (!res.isSuccess) throw new Error(res.message);
			return res.data;
		},
	});

export const createPage = (organizationId: string, body: CreatePageInput) =>
	api<PageDetailDto>(pagesPath(organizationId), {
		method: "POST",
		body: JSON.stringify(body),
	});

export const pageQuery = (organizationId: string, pageId: string) =>
	queryOptions({
		queryKey: pageKeys.detail(organizationId, pageId),
		queryFn: async () => {
			const res = await api<PageDetailDto>(
				pagesPath(organizationId, `/${pageId}`),
			);
			if (!res.isSuccess) throw new Error(res.message);
			return res.data;
		},
	});

/** The SEO description falls back to it; any member can read the profile. */
export const organizationTaglineQuery = (organizationId: string) =>
	queryOptions({
		queryKey: ["organization-profile", organizationId, "tagline"],
		queryFn: async () => {
			const res = await api<OrganizationOnboardingDto>(
				`/organizations/${organizationId}/onboarding`,
			);
			return res.isSuccess ? res.data.profile.tagline : null;
		},
		staleTime: 60_000,
	});

const pageWrite = (
	organizationId: string,
	pageId: string,
	suffix: string,
	init: RequestInit,
) => api<PageDetailDto>(pagesPath(organizationId, `/${pageId}${suffix}`), init);

export const updatePage = (
	organizationId: string,
	pageId: string,
	body: UpdatePageInput,
) =>
	pageWrite(organizationId, pageId, "", {
		method: "PATCH",
		body: JSON.stringify(body),
	});

export const publishPage = (organizationId: string, pageId: string) =>
	pageWrite(organizationId, pageId, "/publish", { method: "POST" });

export const unpublishPage = (organizationId: string, pageId: string) =>
	pageWrite(organizationId, pageId, "/unpublish", { method: "POST" });

export const deletePage = (organizationId: string, pageId: string) =>
	api<null>(pagesPath(organizationId, `/${pageId}`), { method: "DELETE" });

/** After a write: the detail takes the answer, the list refetches (its usage and live flags move too). */
export const storePage = (
	queryClient: QueryClient,
	organizationId: string,
	page: PageDetailDto,
) => {
	queryClient.setQueryData(pageKeys.detail(organizationId, page.id), page);
	return queryClient.invalidateQueries({
		queryKey: pageKeys.list(organizationId),
		refetchType: "all",
	});
};

export const forgetPage = (
	queryClient: QueryClient,
	organizationId: string,
	pageId: string,
) => {
	queryClient.removeQueries({
		queryKey: pageKeys.detail(organizationId, pageId),
	});
	return queryClient.invalidateQueries({
		queryKey: pageKeys.list(organizationId),
		refetchType: "all",
	});
};
