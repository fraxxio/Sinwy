export type OrganizationStatus = "active" | "inactive";

// Single source of truth for industries
export const ORGANIZATION_INDUSTRIES = [
	"beauty",
	"wellness",
	"healthcare",
	"fitness",
	"construction",
	"home-services",
	"automotive",
	"education",
	"events",
	"professional-services",
	"pet-services",
	"food",
	"other",
] as const;

export type OrganizationIndustry = (typeof ORGANIZATION_INDUSTRIES)[number];

export const DEFAULT_ORGANIZATION_INDUSTRY: OrganizationIndustry = "other";

const industryLabels: Record<OrganizationIndustry, string> = {
	beauty: "Beauty & Personal Care",
	wellness: "Wellness & Spa",
	healthcare: "Medical & Healthcare",
	fitness: "Fitness & Sports",
	construction: "Construction & Renovation",
	"home-services": "Home & Repair Services",
	automotive: "Automotive Services",
	education: "Education & Tutoring",
	events: "Events & Entertainment",
	"professional-services": "Professional Services",
	"pet-services": "Pet Services",
	food: "Food & Hospitality",
	other: "Other",
};

export const ORGANIZATION_INDUSTRY_OPTIONS = ORGANIZATION_INDUSTRIES.map(
	(value) => ({ value, label: industryLabels[value] }),
);

export type OrganizationDto = {
	id: string;
	name: string;
	slug: string;
	status: OrganizationStatus;
	industry: OrganizationIndustry;
};
