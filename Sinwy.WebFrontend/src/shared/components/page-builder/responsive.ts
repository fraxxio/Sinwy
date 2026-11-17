import type { CSSProperties } from "react";

export const BREAKPOINTS = ["base", "tablet", "mobile"] as const;
export type Breakpoint = (typeof BREAKPOINTS)[number];

/** `base` is desktop and the fallback for everything narrower; Tailwind's `lg` and `sm` are the edges. */
export type Responsive<T extends string> = { base: T; tablet?: T; mobile?: T };
export type Resolved<T extends string> = Record<Breakpoint, T>;

export const BREAKPOINT_LABELS: Record<Breakpoint, string> = {
	base: "Desktop",
	tablet: "Tablet",
	mobile: "Phone",
};

export const breakpointForWidth = (width: number | "100%"): Breakpoint =>
	width === "100%" || width >= 1024
		? "base"
		: width >= 640
			? "tablet"
			: "mobile";

const pick = <T extends string>(
	value: unknown,
	allowed: readonly T[],
): T | undefined =>
	typeof value === "string" && (allowed as readonly string[]).includes(value)
		? (value as T)
		: undefined;

/** Accepts a plain value too, as saved before the prop became responsive. Unknown values count as unset. */
export function asResponsive<T extends string>(
	value: unknown,
	allowed: readonly T[],
	fallback: T,
): Responsive<T> {
	const raw: { base?: unknown; tablet?: unknown; mobile?: unknown } =
		value && typeof value === "object" ? value : { base: value };
	const tablet = pick(raw.tablet, allowed);
	const mobile = pick(raw.mobile, allowed);
	return {
		base: pick(raw.base, allowed) ?? fallback,
		...(tablet && { tablet }),
		...(mobile && { mobile }),
	};
}

/** Desktop first: an unset tablet value follows desktop, an unset phone value follows tablet. */
export function resolveResponsive<T extends string>(
	value: unknown,
	allowed: readonly T[],
	fallback: T,
): Resolved<T> {
	const { base, tablet, mobile } = asResponsive(value, allowed, fallback);
	const t = tablet ?? base;
	return { base, tablet: t, mobile: mobile ?? t };
}

/** Where an unset breakpoint takes its value from. */
export const inheritsFrom = (breakpoint: Breakpoint): Breakpoint =>
	breakpoint === "mobile" ? "tablet" : "base";

/**
 * Three variables, `--pb-<name>`, `-t` and `-m`, always all set, so a nested block never picks up its parent's override.
 * Classes read them inside media queries, like `p-(--pb-pad) max-lg:p-(--pb-pad-t) max-sm:p-(--pb-pad-m)`.
 */
export const responsiveVars = (
	name: string,
	resolved: Resolved<string>,
): CSSProperties =>
	({
		[`--pb-${name}`]: resolved.base,
		[`--pb-${name}-t`]: resolved.tablet,
		[`--pb-${name}-m`]: resolved.mobile,
	}) as CSSProperties;

export const mapResolved = <T extends string, U extends string>(
	resolved: Resolved<T>,
	map: (value: T, breakpoint: Breakpoint) => U,
): Resolved<U> => ({
	base: map(resolved.base, "base"),
	tablet: map(resolved.tablet, "tablet"),
	mobile: map(resolved.mobile, "mobile"),
});

export type ResponsiveFieldOptions = {
	options: readonly { label: string; value: string }[];
	fallback: string;
};

export const responsiveOptions = (field: { metadata?: unknown }) =>
	(field.metadata as { responsive?: ResponsiveFieldOptions } | undefined)
		?.responsive;

/** A field the storefront can read as plain data; the editor swaps in a viewport-aware control for any field carrying `metadata.responsive`. */
export const responsiveField = (
	label: string,
	responsive: ResponsiveFieldOptions,
) => ({
	type: "custom" as const,
	label,
	metadata: { responsive },
	render: () => null as never,
});

export const VISIBILITY = ["show", "hide"] as const;

/** The breakpoints a block is hidden on, as the `data-pb-hide` value the stylesheet matches. */
export const hiddenOn = (value: unknown): string =>
	BREAKPOINTS.filter(
		(breakpoint) =>
			resolveResponsive(value, VISIBILITY, "show")[breakpoint] === "hide",
	).join(" ");
