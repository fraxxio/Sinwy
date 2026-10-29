import { serviceSchema } from "@sinwy/shared";
import z from "zod";

const description = z
	.string()
	.nullish()
	.transform((value) => value ?? "")
	.pipe(serviceSchema.shape.description)
	.transform((value) => value || null);

/** Currency comes from the organization and capacity isn't editable, so neither is read. */
export const createServiceBody = serviceSchema.extend({
	description,
	bufferBeforeMinutes: serviceSchema.shape.bufferBeforeMinutes.default(0),
	bufferAfterMinutes: serviceSchema.shape.bufferAfterMinutes.default(0),
});

export const updateServiceBody = serviceSchema
	.extend({ description, isActive: z.boolean() })
	.partial();

export type CreateServiceInput = z.infer<typeof createServiceBody>;
export type UpdateServiceInput = z.infer<typeof updateServiceBody>;
