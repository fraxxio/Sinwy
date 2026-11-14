import {
	type BrandFont,
	brandTextColor,
	type OrganizationBrandingDto,
} from "@sinwy/shared";
import type { CSSProperties } from "react";

/** Each is a self-hosted `@fontsource-variable` package loaded in `styles.css`; the browser fetches only the faces in use. */
export const BRAND_FONT_FAMILIES: Record<BrandFont, string> = {
	modern: '"Inter Variable", ui-sans-serif, system-ui, sans-serif',
	friendly: '"Nunito Variable", ui-sans-serif, system-ui, sans-serif',
	classic: '"Lora Variable", ui-serif, Georgia, serif',
	elegant: '"Playfair Display Variable", ui-serif, Georgia, serif',
	technical: '"Space Grotesk Variable", ui-sans-serif, system-ui, sans-serif',
};

type BrandAttributes = {
	style?: CSSProperties;
	"data-brand-color"?: "";
	"data-brand-font"?: "";
};

/** Spread on the element that wraps an organization's hosted content; nothing at all for Sinwy's defaults. */
export const brandAttributes = ({
	color,
	font,
}: OrganizationBrandingDto): BrandAttributes => {
	if (!color && !font) return {};
	return {
		style: {
			...(color && {
				"--brand-color": color,
				"--brand-on-color": brandTextColor(color),
			}),
			...(font && { "--brand-font": BRAND_FONT_FAMILIES[font] }),
		} as CSSProperties,
		...(color && { "data-brand-color": "" }),
		...(font && { "data-brand-font": "" }),
	};
};
