import { z } from "zod";
import { SERVICE_LIMITS as LIMITS } from "./Service";

const buffer = (label: string) =>
	z
		.number(`${label} is required`)
		.int()
		.min(0, `${label} can't be negative`)
		.max(LIMITS.bufferMax, `${label} is at most ${LIMITS.bufferMax} minutes`)
		.multipleOf(LIMITS.bufferStep, `Use steps of ${LIMITS.bufferStep} minutes`);

/**
 * The editor fields the form and the API both enforce. The API adds
 * canonicalization (empty description stored as null) and its defaults.
 */
export const serviceSchema = z.object({
	name: z
		.string()
		.trim()
		.min(1, "Name is required")
		.max(LIMITS.name, `Max ${LIMITS.name} characters`),
	description: z
		.string()
		.trim()
		.max(LIMITS.description, `Max ${LIMITS.description} characters`),
	durationMinutes: z
		.number("Duration is required")
		.int()
		.min(LIMITS.durationMin, `At least ${LIMITS.durationMin} minutes`)
		.max(LIMITS.durationMax, `At most ${LIMITS.durationMax / 60} hours`)
		.multipleOf(
			LIMITS.durationStep,
			`Use steps of ${LIMITS.durationStep} minutes`,
		),
	priceMinor: z
		.number("Price is required")
		.int("Price has too many decimals")
		.min(0, "Price can't be negative")
		.max(LIMITS.priceMinorMax, "Price is too high"),
	bufferBeforeMinutes: buffer("Buffer before"),
	bufferAfterMinutes: buffer("Buffer after"),
});

export type ServiceInput = z.infer<typeof serviceSchema>;
