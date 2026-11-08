import { createHash } from "node:crypto";
import appConfig from "@config";
import { findPublicOrganizationPlan } from "@organizationsModule";
import { findServedPageId } from "@pagesModule";
import { todayIn } from "@servicesModule";
import type { DeviceType, TrackEventInput } from "@sinwy/shared";
import { insertEvent, saltFor } from "./repository";

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
