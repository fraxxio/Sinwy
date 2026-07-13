export type OrganizationStatus = "active" | "inactive";

export type OrganizationDto = {
	id: string;
	name: string;
	slug: string;
	status: OrganizationStatus;
};
