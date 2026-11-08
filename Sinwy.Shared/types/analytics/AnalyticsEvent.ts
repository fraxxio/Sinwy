import { z } from "zod";
import { PAGE_LIMITS } from "../page/Page";

export const ANALYTICS_EVENT_KINDS = ["view", "booking_started"] as const;
export type AnalyticsEventKind = (typeof ANALYTICS_EVENT_KINDS)[number];

export const DEVICE_TYPES = ["mobile", "tablet", "desktop"] as const;
export type DeviceType = (typeof DEVICE_TYPES)[number];

export const MAX_REFERRER_LENGTH = 2048;

/** One tracked event; without `pageSlug` it is about the booking page. */
export const trackEventSchema = z
	.object({
		kind: z.enum(ANALYTICS_EVENT_KINDS),
		pageSlug: z.string().min(1).max(PAGE_LIMITS.slug).optional(),
		// a bad referrer mustn't cost the event, so it's dropped on its own
		referrer: z.string().max(MAX_REFERRER_LENGTH).optional().catch(undefined),
	})
	.refine((event) => event.kind === "view" || !event.pageSlug, {
		message: "Only a view can be about a page",
	});

export type TrackEventInput = z.infer<typeof trackEventSchema>;
