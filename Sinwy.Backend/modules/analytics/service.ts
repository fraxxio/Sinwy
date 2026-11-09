import { createHash } from "node:crypto";
import { isOrganizationMember, type Membership } from "@authModule";
import { getBookingAnalytics } from "@bookingsModule";
import appConfig from "@config";
import { findPublicOrganizationPlan } from "@organizationsModule";
import { findServedPageId, getPageLabels } from "@pagesModule";
import { todayIn } from "@servicesModule";
import {
	ANALYTICS_LIMITS,
	type AnalyticsExportQuery,
	type AnalyticsRangeDto,
	type AnalyticsRangeQuery,
	type BookingsBreakdownDto,
	type BookingsDto,
	type DeviceType,
	type FunnelDto,
	type TrackEventInput,
	type TrafficBreakdownDto,
	type TrafficDto,
} from "@sinwy/shared";
import { bookingsCsv, funnelCsv, trafficCsv } from "./csv";
import {
	type AnalyticsRangeError,
	datesIn,
	resolveAnalyticsRange,
} from "./range";
import {
	findDailyTotals,
	insertEvent,
	saltFor,
	sumDailyByKey,
	sumDailyVisitors,
	sumPageViews,
} from "./repository";

const BOT = /bot|crawl|spider|slurp|preview|headless|lighthouse/i;
const TABLET = /ipad|tablet|kindle|silk|playbook|android(?!.*mobile)/i;
const MOBILE = /mobi|iphone|ipod|windows phone/i;

export const isBot = (userAgent: string) => BOT.test(userAgent);

export const deviceOf = (userAgent: string): DeviceType =>
	TABLET.test(userAgent)
		? "tablet"
		: MOBILE.test(userAgent)
			? "mobile"
			: "desktop";

const ownHost = new URL(appConfig.WEB_APP_URL).hostname;

/** The referrer's host; null for direct visits, our own pages and anything unparsable. */
export const referrerHostOf = (referrer: string | undefined) => {
	if (!referrer) return null;
	try {
		const url = new URL(referrer);
		if (url.protocol !== "http:" && url.protocol !== "https:") return null;
		return url.hostname === ownHost ? null : url.hostname;
	} catch {
		return null;
	}
};

const newSalt = () =>
	Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex");

export const visitorHash = (
	salt: string,
	organizationId: string,
	ip: string,
	userAgent: string,
) =>
	createHash("sha256")
		.update([salt, organizationId, ip, userAgent].join("\n"))
		.digest("hex");

type TrackRequest = {
	organizationSlug: string;
	event: TrackEventInput;
	ip: string | null;
	userAgent: string | null;
	/** The signed-in user, if any. */
	userId: string | null;
};

/**
 * Stores the event, or silently drops it for a bot, an organization that
 * isn't public, a page that isn't served or one of the organization's members.
 */
export const trackEvent = async (
	{ organizationSlug, event, ip, userAgent, userId }: TrackRequest,
	now = new Date(),
) => {
	if (!userAgent || isBot(userAgent)) return;
	const organization = await findPublicOrganizationPlan(organizationSlug);
	if (!organization) return;
	if (userId && (await isOrganizationMember(userId, organization.id))) return;
	const pageId = event.pageSlug
		? await findServedPageId(organization.id, organization.plan, event.pageSlug)
		: null;
	if (event.pageSlug && !pageId) return;

	const localDate = todayIn(organization.timezone, now);
	const salt = await saltFor(localDate, newSalt);
	await insertEvent({
		id: crypto.randomUUID(),
		organizationId: organization.id,
		pageId,
		kind: event.kind,
		localDate,
		visitorHash: visitorHash(salt, organization.id, ip ?? "", userAgent),
		referrerHost: referrerHostOf(event.referrer),
		device: deviceOf(userAgent),
		createdAt: now,
	});
};

export type Result<T> =
	| { ok: true; data: T }
	| { ok: false; error: AnalyticsRangeError };

export const getTraffic = async (
	membership: Membership,
	query: AnalyticsRangeQuery,
	now = new Date(),
): Promise<Result<TrafficDto>> => {
	const range = await resolveAnalyticsRange(membership, query, now);
	if (!range.ok) return range;

	const rows = await findDailyTotals(membership.organizationId, range.data);
	const byDate = new Map(rows.map((row) => [row.date, row]));
	const series = datesIn(range.data).map((date) => ({
		date,
		views: byDate.get(date)?.views ?? 0,
		visitors: byDate.get(date)?.visitors ?? 0,
	}));
	const totals = series.reduce(
		(sum, day) => ({
			views: sum.views + day.views,
			visitors: sum.visitors + day.visitors,
		}),
		{ views: 0, visitors: 0 },
	);
	return { ok: true, data: { range: range.data, totals, series } };
};

export const getTrafficBreakdown = async (
	membership: Membership,
	query: AnalyticsRangeQuery,
	now = new Date(),
): Promise<Result<TrafficBreakdownDto>> => {
	const range = await resolveAnalyticsRange(membership, query, now);
	if (!range.ok) return range;

	const { organizationId } = membership;
	const [pages, referrers, devices] = await Promise.all([
		sumPageViews(organizationId, range.data),
		sumDailyByKey(
			organizationId,
			"referrer",
			range.data,
			ANALYTICS_LIMITS.topReferrers,
		),
		sumDailyByKey(organizationId, "device", range.data),
	]);
	const labels = await getPageLabels(
		organizationId,
		pages.flatMap(({ pageId }) => (pageId ? [pageId] : [])),
	);
	return {
		ok: true,
		data: {
			range: range.data,
			pages: pages.map(({ pageId, views, visitors }) => {
				const label = pageId ? labels.get(pageId) : undefined;
				return {
					pageId,
					title: label?.title ?? null,
					slug: label?.slug ?? null,
					views,
					visitors,
				};
			}),
			referrers: referrers.map(({ key, views, visitors }) => ({
				host: key || null,
				views,
				visitors,
			})),
			devices: devices.map(({ key, views, visitors }) => ({
				device: key as DeviceType,
				views,
				visitors,
			})),
		},
	};
};

const bookingFiguresIn = (organizationId: string, range: AnalyticsRangeDto) =>
	getBookingAnalytics(organizationId, range, range.timezone);

export const getBookings = async (
	membership: Membership,
	query: AnalyticsRangeQuery,
	now = new Date(),
): Promise<Result<BookingsDto>> => {
	const range = await resolveAnalyticsRange(membership, query, now);
	if (!range.ok) return range;

	const { created, starting } = await bookingFiguresIn(
		membership.organizationId,
		range.data,
	);
	const createdOn = new Map(created.map((row) => [row.date, row.bookings]));
	const bookedOn = new Map(starting.map((row) => [row.date, row.bookedMinor]));
	const series = datesIn(range.data).map((date) => ({
		date,
		bookings: createdOn.get(date) ?? 0,
		bookedMinor: bookedOn.get(date) ?? 0,
	}));
	const totals = series.reduce(
		(sum, day) => ({
			bookings: sum.bookings + day.bookings,
			bookedMinor: sum.bookedMinor + day.bookedMinor,
		}),
		{ bookings: 0, bookedMinor: 0 },
	);
	return { ok: true, data: { range: range.data, totals, series } };
};

const rateOf = (part: number, whole: number) =>
	whole > 0 ? part / whole : null;

export const getBookingsBreakdown = async (
	membership: Membership,
	query: AnalyticsRangeQuery,
	now = new Date(),
): Promise<Result<BookingsBreakdownDto>> => {
	const range = await resolveAnalyticsRange(membership, query, now);
	if (!range.ok) return range;

	const { starting, services } = await bookingFiguresIn(
		membership.organizationId,
		range.data,
	);
	const sum = (pick: (row: (typeof starting)[number]) => number) =>
		starting.reduce((total, row) => total + pick(row), 0);
	const bookings = sum((row) => row.bookings);
	const cancelledByCustomer = sum((row) => row.cancelledByCustomer);
	const cancelledByOrganization = sum((row) => row.cancelledByOrganization);
	const noShows = sum((row) => row.noShows);
	const finished = sum((row) => row.completed) + noShows;
	return {
		ok: true,
		data: {
			range: range.data,
			services,
			cancellation: {
				bookings,
				cancelledByCustomer,
				cancelledByOrganization,
				rate: rateOf(cancelledByCustomer + cancelledByOrganization, bookings),
				customerRate: rateOf(cancelledByCustomer, bookings),
				organizationRate: rateOf(cancelledByOrganization, bookings),
			},
			noShow: { finished, noShows, rate: rateOf(noShows, finished) },
		},
	};
};

export const getFunnel = async (
	membership: Membership,
	query: AnalyticsRangeQuery,
	now = new Date(),
): Promise<Result<FunnelDto>> => {
	const range = await resolveAnalyticsRange(membership, query, now);
	if (!range.ok) return range;

	const { organizationId } = membership;
	const [viewed, started, { created }] = await Promise.all([
		sumDailyVisitors(organizationId, "total", range.data),
		sumDailyVisitors(organizationId, "booking_started", range.data),
		bookingFiguresIn(organizationId, range.data),
	]);
	const booked = created.reduce((total, row) => total + row.storefront, 0);
	return {
		ok: true,
		data: {
			range: range.data,
			steps: [
				{ step: "viewed", count: viewed },
				{ step: "started", count: started },
				{ step: "booked", count: booked },
			],
		},
	};
};

type ReportCsv = { range: AnalyticsRangeDto; csv: string };

const withCsv = <T extends { range: AnalyticsRangeDto }>(
	result: Result<T>,
	toCsv: (data: T) => string,
): Result<ReportCsv> =>
	result.ok
		? { ok: true, data: { range: result.data.range, csv: toCsv(result.data) } }
		: result;

const reportCsv = async (
	membership: Membership,
	{ report, ...query }: AnalyticsExportQuery,
	now: Date,
) => {
	switch (report) {
		case "traffic":
			return withCsv(await getTraffic(membership, query, now), trafficCsv);
		case "bookings":
			return withCsv(await getBookings(membership, query, now), bookingsCsv);
		case "funnel":
			return withCsv(await getFunnel(membership, query, now), funnelCsv);
	}
};

export const exportAnalytics = async (
	membership: Membership,
	query: AnalyticsExportQuery,
	now = new Date(),
): Promise<Result<{ filename: string; csv: string }>> => {
	const result = await reportCsv(membership, query, now);
	if (!result.ok) return result;
	const { range, csv } = result.data;
	return {
		ok: true,
		data: {
			filename: `analytics-${query.report}-${range.from}-to-${range.to}.csv`,
			csv,
		},
	};
};
