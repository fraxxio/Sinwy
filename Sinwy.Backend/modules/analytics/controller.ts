import type { Handler } from "@backend/lib/app/types";
import { clientIp } from "@backend/lib/clientIp";
import { createLogger } from "@logger";
import { trackEventSchema } from "@sinwy/shared";
import { trackEvent } from "./service";

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
