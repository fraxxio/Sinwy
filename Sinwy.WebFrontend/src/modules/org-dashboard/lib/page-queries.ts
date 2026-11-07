import type {
	CreatePageInput,
	PageDetailDto,
	PageListDto,
} from "@sinwy/shared";
import { queryOptions } from "@tanstack/react-query";
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
