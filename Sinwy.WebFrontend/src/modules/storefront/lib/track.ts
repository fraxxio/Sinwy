import type { AnalyticsEventKind, TrackEventInput } from "@sinwy/shared";
import { useEffect, useRef } from "react";

/** Fire-and-forget: survives navigation away and never throws. Browser only. */
export function trackEvent(slug: string, event: TrackEventInput) {
	if (typeof window === "undefined") return;
	fetch(`/api/public/organizations/${encodeURIComponent(slug)}/events`, {
		method: "POST",
		keepalive: true,
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(event),
	}).catch(() => {});
}

/**
 * Sends the event on mount; without `pageSlug` it is about the booking page.
 * The ref keeps StrictMode's repeated effect from sending it twice.
 */
export function useTrackEvent(
	slug: string,
	kind: AnalyticsEventKind,
	pageSlug?: string,
) {
	const sent = useRef<string | null>(null);
	useEffect(() => {
		const key = `${slug}/${kind}/${pageSlug ?? ""}`;
		if (sent.current === key) return;
		sent.current = key;
		trackEvent(slug, {
			kind,
			pageSlug,
			referrer: kind === "view" ? document.referrer || undefined : undefined,
		});
	}, [slug, kind, pageSlug]);
}
