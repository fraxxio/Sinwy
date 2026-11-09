import { z } from "zod";
import { toQueryString } from "#/modules/org-dashboard/lib/booking-search";
import {
	type DateRange,
	optionalDate,
	validRangeOr,
} from "#/modules/org-dashboard/lib/date-range";

/** No range means the API's default; a bad, one-sided or reversed range falls back to it so a stale URL still opens the page. */
export const paymentsSearchSchema = z
	.object({
		from: optionalDate,
		to: optionalDate,
		page: z.coerce.number().int().min(1).default(1).catch(1),
	})
	.transform(validRangeOr);

export type PaymentsSearch = z.infer<typeof paymentsSearchSchema>;

export const PAYMENTS_SEARCH_DEFAULTS = paymentsSearchSchema.parse({});

export const paymentsPath = (organizationId: string, suffix = "") =>
	`/organizations/${organizationId}/payments${suffix}`;

/** Same-origin URL of the CSV for a range; the browser downloads it with the session cookie. */
export const paymentsExportUrl = (organizationId: string, range: DateRange) =>
	`/api${paymentsPath(organizationId, `/export${toQueryString(range)}`)}`;
