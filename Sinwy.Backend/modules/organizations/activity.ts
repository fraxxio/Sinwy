import type { Job } from "@backend/lib/jobs";
import { createLogger } from "@logger";
import {
	ACTIVITY_PAGE_SIZE,
	ACTIVITY_RETENTION_DAYS,
	type ActivityEvent,
	type OrganizationActivityDto,
	type OrganizationActivityPageDto,
} from "@sinwy/shared";
import {
	deleteActivityBefore,
	findActivity,
	insertActivity,
} from "./repository";

const activityLogger = createLogger("organizations:activity");

/** Who did it; null when Sinwy acted on its own. */
export type ActivityActor = { id: string; name: string } | null;

/**
 * Best effort, after the change has committed: a failed write is logged and
 * never fails the action it describes.
 */
export const recordActivity = async (
	organizationId: string,
	actor: ActivityActor,
	event: ActivityEvent,
) => {
	try {
		await insertActivity({
			// time-ordered, so entries of the same millisecond keep their order
			id: Bun.randomUUIDv7(),
			organizationId,
			actorUserId: actor?.id ?? null,
			actorName: actor?.name ?? null,
			action: event.action,
			details: event.details,
		});
	} catch (error) {
		activityLogger.error("Failed to record activity", {
			organizationId,
			action: event.action,
			error,
		});
	}
};

type Cursor = { occurredAt: Date; id: string };

const encodeCursor = ({ occurredAt, id }: Cursor) =>
	`${occurredAt.toISOString()}_${id}`;

/** null for anything that isn't a cursor `listActivity` handed out. */
export const parseActivityCursor = (raw: string): Cursor | null => {
	const at = raw.indexOf("_");
	const occurredAt = new Date(raw.slice(0, at));
	const id = raw.slice(at + 1);
	return at < 0 || Number.isNaN(occurredAt.getTime()) || !id
		? null
		: { occurredAt, id };
};

export const listActivity = async (
	organizationId: string,
	before: Cursor | null,
): Promise<OrganizationActivityPageDto> => {
	const rows = await findActivity(
		organizationId,
		before,
		ACTIVITY_PAGE_SIZE + 1,
	);
	const page = rows.slice(0, ACTIVITY_PAGE_SIZE);
	const last = page.at(-1);
	return {
		entries: page.map(
			(row) =>
				({
					id: row.id,
					occurredAt: row.occurredAt.toISOString(),
					action: row.action,
					details: row.details,
					actor:
						row.actorName === null
							? null
							: { name: row.actorName, image: row.actorImage },
				}) as OrganizationActivityDto,
		),
		nextCursor:
			rows.length > ACTIVITY_PAGE_SIZE && last ? encodeCursor(last) : null,
	};
};

const RETENTION_MS = ACTIVITY_RETENTION_DAYS * 24 * 60 * 60 * 1000;

export const purgeOldActivity = async (now = new Date()) => {
	const deleted = await deleteActivityBefore(
		new Date(now.getTime() - RETENTION_MS),
	);
	if (deleted > 0) activityLogger.info("Deleted old activity", { deleted });
	return deleted;
};

export const purgeActivityJob: Job<number> = {
	name: "purge-organization-activity",
	intervalMs: 60 * 60 * 1000,
	run: () => purgeOldActivity(),
};
