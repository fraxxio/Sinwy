import { z } from "zod";

/** Feeds a text input's string into a shared schema that also takes null and undefined, which an input never sends. */
export const fromText = <
	T extends z.ZodType<unknown, string | null | undefined>,
>(
	schema: T,
) =>
	z
		.string()
		.transform((value): string | null | undefined => value)
		.pipe(schema);
