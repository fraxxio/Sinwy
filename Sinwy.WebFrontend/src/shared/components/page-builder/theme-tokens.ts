import type {
	BlockValue,
	OrganizationBrandingDto,
	PublicServiceDto,
} from "@sinwy/shared";
import type { CSSProperties } from "react";

export const RADIUS = {
	none: "0px",
	small: "0.375rem",
	medium: "0.75rem",
	large: "1.5rem",
} as const satisfies Record<BlockValue<"radius">, string>;

export const SPACING = {
	compact: "0.75rem",
	comfortable: "1.5rem",
	spacious: "2.5rem",
} as const satisfies Record<BlockValue<"spacing">, string>;

export type Radius = keyof typeof RADIUS;
export type Spacing = keyof typeof SPACING;
export type ThemeTokens = { radius: Radius; spacing: Spacing };

const pick = <T extends Record<string, string>>(
	map: T,
	key: unknown,
	fallback: keyof T,
) =>
	(typeof key === "string" && Object.hasOwn(map, key)
		? map[key]
		: map[fallback]) as string;

/** Root tokens as CSS variables; blocks read them through static classes like `rounded-(--pb-radius)`. */
export const tokenStyle = ({
	radius,
	spacing,
}: {
	radius?: Radius | undefined;
	spacing?: Spacing | undefined;
}) =>
	({
		"--pb-radius": pick(RADIUS, radius, "medium"),
		"--pb-space": pick(SPACING, spacing, "comfortable"),
	}) as CSSProperties;

/** What a page renders with besides its document, passed as Puck `metadata`. */
export type BuilderMetadata = {
	organizationSlug: string;
	services: PublicServiceDto[];
	branding?: OrganizationBrandingDto | null | undefined;
};

export const builderMetadata = (
	metadata: Record<string, unknown>,
): BuilderMetadata => {
	const { organizationSlug, services, branding } = metadata;
	return {
		organizationSlug:
			typeof organizationSlug === "string" ? organizationSlug : "",
		services: Array.isArray(services) ? services : [],
		branding: (branding as OrganizationBrandingDto | undefined) ?? null,
	};
};
