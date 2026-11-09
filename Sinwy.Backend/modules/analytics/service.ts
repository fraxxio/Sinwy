import { createHash } from "node:crypto";
import type { Membership } from "@authModule";
import appConfig from "@config";
import { findPublicOrganizationPlan } from "@organizationsModule";
import { findServedPageId, getPageLabels } from "@pagesModule";
import { todayIn } from "@servicesModule";
import {
	ANALYTICS_LIMITS,
	type AnalyticsRangeQuery,
	type DeviceType,
	type TrackEventInput,
	type TrafficBreakdownDto,
	type TrafficDto,
} from "@sinwy/shared";
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
};

/** Stores the event, or silently drops it for a bot, an organization that isn't public or a page that isn't served. */
export const trackEvent = async (
	{ organizationSlug, event, ip, userAgent }: TrackRequest,
	now = new Date(),
) => {
	if (!userAgent || isBot(userAgent)) return;
	const organization = await findPublicOrganizationPlan(organizationSlug);
	if (!organization) return;
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
