import { type Membership, membershipFrom } from "@authModule";
import { fail, ok } from "@backend/lib/app/respond";
import type { Handler, IReqContext } from "@backend/lib/app/types";
import { clientIp } from "@backend/lib/clientIp";
import { createLogger } from "@logger";
import {
	type AnalyticsRangeQuery,
	API_ERROR_CODES,
	analyticsExportQuerySchema,
	analyticsRangeQuerySchema,
	trackEventSchema,
} from "@sinwy/shared";
import type { z } from "zod";
import type { AnalyticsRangeError } from "./range";
import {
	exportAnalytics,
	getBookings,
	getBookingsBreakdown,
	getFunnel,
	getTraffic,
	getTrafficBreakdown,
	type Result,
	trackEvent,
} from "./service";

const logger = createLogger("analytics");

/** Always 204, so the answer never tells whether the organization or page exists. */
export const trackEventHandler: Handler = async (c) => {
	const { slug } = c.req.params as { slug: string };
	const event = trackEventSchema.safeParse(
		await c.req.json().catch(() => null),
	);
	if (event.success) {
		try {
			await trackEvent({
				organizationSlug: slug,
				event: event.data,
				ip: clientIp(c),
				userAgent: c.req.headers.get("user-agent"),
			});
		} catch (error) {
			logger.error("Tracking an event failed", { error });
		}
	}
	return new Response(null, { status: 204 });
};

const respondError = (error: AnalyticsRangeError) => {
	switch (error) {
		case "no-retention":
			return fail(
				"Your plan doesn't include analytics",
				402,
				API_ERROR_CODES.PLAN_UPGRADE_REQUIRED,
			);
		case "not-found":
			return fail("Not found", 404);
	}
};

const parseQuery = <T extends z.ZodType>(c: IReqContext, schema: T) => {
	const query = schema.safeParse(
		Object.fromEntries(new URL(c.req.url).searchParams),
	);
	return query.success
		? ({ ok: true, data: query.data } as const)
		: ({
				ok: false,
				response: fail(query.error.issues[0]?.message ?? "Invalid query", 400),
			} as const);
};

const rangeHandler =
	<T>(
		read: (
			membership: Membership,
			query: AnalyticsRangeQuery,
		) => Promise<Result<T>>,
	): Handler =>
	async (c) => {
		const query = parseQuery(c, analyticsRangeQuerySchema);
		if (!query.ok) return query.response;

		const result = await read(membershipFrom(c), query.data);
		return result.ok ? ok(result.data) : respondError(result.error);
	};

export const getTrafficHandler = rangeHandler(getTraffic);
export const getTrafficBreakdownHandler = rangeHandler(getTrafficBreakdown);
export const getBookingsHandler = rangeHandler(getBookings);
export const getBookingsBreakdownHandler = rangeHandler(getBookingsBreakdown);
export const getFunnelHandler = rangeHandler(getFunnel);

export const exportAnalyticsHandler: Handler = async (c) => {
	const query = parseQuery(c, analyticsExportQuerySchema);
	if (!query.ok) return query.response;

	const result = await exportAnalytics(membershipFrom(c), query.data);
	if (!result.ok) return respondError(result.error);
	return new Response(result.data.csv, {
		headers: {
			"Content-Type": "text/csv; charset=utf-8",
			"Content-Disposition": `attachment; filename="${result.data.filename}"`,
		},
	});
};
