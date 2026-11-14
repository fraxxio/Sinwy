import type {
	OrganizationBrandingDto,
	OrganizationGeneralDto,
	OrganizationNameInput,
	OrganizationProfileDto,
	OrganizationTimezoneInput,
} from "@sinwy/shared";
import { queryOptions, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { api } from "#/shared/lib/api";
import { invalidateOrganizations } from "#/shared/lib/organizations";
import { serviceKeys } from "./service-queries";

export const settingsKeys = {
	general: (organizationId: string) =>
		["settings", organizationId, "general"] as const,
};

const settingsPath = (organizationId: string, suffix: string) =>
	`/organizations/${organizationId}/${suffix}`;

export const generalQuery = (organizationId: string) =>
	queryOptions({
		queryKey: settingsKeys.general(organizationId),
		queryFn: async () => {
			const res = await api<OrganizationGeneralDto>(
				settingsPath(organizationId, "general"),
			);
			if (!res.isSuccess) throw new Error(res.message);
			return res.data;
		},
	});

export const logoPath = (organizationId: string) =>
	settingsPath(organizationId, "logo");

export const renameOrganization = (
	organizationId: string,
	body: OrganizationNameInput,
) =>
	api<OrganizationNameInput>(settingsPath(organizationId, "name"), {
		method: "PUT",
		body: JSON.stringify(body),
	});

export const changeTimezone = (
	organizationId: string,
	body: OrganizationTimezoneInput,
) =>
	api<OrganizationTimezoneInput>(settingsPath(organizationId, "timezone"), {
		method: "PUT",
		body: JSON.stringify(body),
	});

export const changeBranding = (
	organizationId: string,
	body: OrganizationBrandingDto,
) =>
	api<OrganizationBrandingDto>(settingsPath(organizationId, "branding"), {
		method: "PUT",
		body: JSON.stringify(body),
	});

export const saveProfile = (
	organizationId: string,
	body: Record<keyof OrganizationProfileDto, string>,
) =>
	api<OrganizationProfileDto>(settingsPath(organizationId, "profile"), {
		method: "PUT",
		body: JSON.stringify(body),
	});

/**
 * After a General change: the settings, the hours that show the zone, the
 * switcher's list and the shell's route context (name and logo in the
 * breadcrumbs) all reload.
 */
export function useRefreshGeneral(organizationId: string) {
	const queryClient = useQueryClient();
	const router = useRouter();
	return async () => {
		await Promise.all([
			queryClient.invalidateQueries({
				queryKey: settingsKeys.general(organizationId),
			}),
			queryClient.invalidateQueries({
				queryKey: serviceKeys.availability(organizationId),
			}),
			invalidateOrganizations(queryClient),
		]);
		await router.invalidate();
	};
}
