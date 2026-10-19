import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import appConfig from "@config";
import { z } from "zod";

const outboxEmailSchema = z.object({
	id: z.string(),
	sentAt: z.iso.datetime(),
	to: z.string(),
	from: z.string(),
	subject: z.string(),
	html: z.string(),
	props: z.unknown(),
});

export type OutboxEmail = z.infer<typeof outboxEmailSchema>;

export const writeOutboxEmail = async (email: Omit<OutboxEmail, "id">) => {
	// v7 ids sort by creation time, so file names give the send order
	const id = Bun.randomUUIDv7();
	const path = join(appConfig.EMAIL_OUTBOX_DIR, `${id}.json`);
	await mkdir(appConfig.EMAIL_OUTBOX_DIR, { recursive: true });
	await Bun.write(path, JSON.stringify({ id, ...email }, null, "\t"));
	return path;
};

/** Newest first. */
export const readOutboxEmails = async () => {
	const names = await readdir(appConfig.EMAIL_OUTBOX_DIR).catch(
		(error: NodeJS.ErrnoException) => {
			if (error.code === "ENOENT") return [];
			throw error;
		},
	);

	const files = names
		.filter((name) => name.endsWith(".json"))
		.sort()
		.reverse()
		.map((name) => join(appConfig.EMAIL_OUTBOX_DIR, name));

	return Promise.all(
		files.map(async (file) => ({
			file,
			email: outboxEmailSchema.parse(await Bun.file(file).json()),
		})),
	);
};
