import { z } from "zod";
import { toQueryString } from "#/modules/org-dashboard/lib/booking-search";

const optionalDate = z.iso.date().optional().catch(undefined);

/** No range means the API's default; a bad, one-sided or reversed range falls back to it so a stale URL still opens the page. */
export const paymentsSearchSchema = z
	.object({
		from: optionalDate,
		to: optionalDate,
		page: z.coerce.number().int().min(1).default(1).catch(1),
	})
	.transform((search) =>
		search.from && search.to && search.from <= search.to
			? search
			: { from: undefined, to: undefined, page: search.page },
	);

export type PaymentsSearch = z.infer<typeof paymentsSearchSchema>;

type Range = { from: string; to: string };

/** Applies one changed end of the range; the other end follows it when the range would turn around. */
export function changeRange(current: Range, change: Partial<Range>): Range {
	const next = { ...current, ...change };
	if (next.from <= next.to) return next;
	return change.from
		? { from: next.from, to: next.from }
		: { from: next.to, to: next.to };
}

export const PAYMENTS_SEARCH_DEFAULTS = paymentsSearchSchema.parse({});

export const paymentsPath = (organizationId: string, suffix = "") =>
	`/organizations/${organizationId}/payments${suffix}`;

/** Same-origin URL of the CSV for a range; the browser downloads it with the session cookie. */
export const paymentsExportUrl = (organizationId: string, range: Range) =>
	`/api${paymentsPath(organizationId, `/export${toQueryString(range)}`)}`;
