import type { ApiResponse, ServiceDto, ServiceInput } from "@sinwy/shared";
import { queryOptions, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { api } from "#/shared/lib/api";
import { handleOrganizationInactive } from "#/shared/lib/auth/organization-inactive";

export const serviceKeys = {
	all: (organizationId: string) => ["services", organizationId] as const,
	list: (organizationId: string) =>
		[...serviceKeys.all(organizationId), "list"] as const,
	detail: (organizationId: string, serviceId: string) =>
		[...serviceKeys.all(organizationId), "detail", serviceId] as const,
};

const servicesPath = (organizationId: string, suffix = "") =>
	`/organizations/${organizationId}/services${suffix}`;

export const servicesQuery = (organizationId: string) =>
	queryOptions({
		queryKey: serviceKeys.list(organizationId),
		queryFn: async () => {
			const res = await api<ServiceDto[]>(servicesPath(organizationId));
			if (!res.isSuccess) throw new Error(res.message);
			return res.data;
		},
	});

export const serviceQuery = (organizationId: string, serviceId: string) =>
	queryOptions({
		queryKey: serviceKeys.detail(organizationId, serviceId),
		queryFn: async () => {
			const res = await api<ServiceDto>(
				servicesPath(organizationId, `/${serviceId}`),
			);
			if (!res.isSuccess) throw new Error(res.message);
			return res.data;
		},
	});

export const createService = (organizationId: string, body: ServiceInput) =>
	api<ServiceDto>(servicesPath(organizationId), {
		method: "POST",
		body: JSON.stringify(body),
	});

export const updateService = (
	organizationId: string,
	serviceId: string,
	body: Partial<ServiceInput & { isActive: boolean }>,
) =>
	api<ServiceDto>(servicesPath(organizationId, `/${serviceId}`), {
		method: "PATCH",
		body: JSON.stringify(body),
	});

export const duplicateService = (organizationId: string, serviceId: string) =>
	api<ServiceDto>(servicesPath(organizationId, `/${serviceId}/duplicate`), {
		method: "POST",
	});

export const archiveService = (organizationId: string, serviceId: string) =>
	api<null>(servicesPath(organizationId, `/${serviceId}`), {
		method: "DELETE",
	});

/**
 * Turns a write's response into its data or a thrown error. An inactive
 * organization gets the shell's own notice instead, so that error's message is
 * empty and callers show nothing of their own.
 */
export function useUnwrapWrite() {
	const router = useRouter();
	const queryClient = useQueryClient();
	return <T>(res: ApiResponse<T>): T => {
		if (res.isSuccess) return res.data;
		throw new Error(
			handleOrganizationInactive(res, router, queryClient) ? "" : res.message,
		);
	};
}
