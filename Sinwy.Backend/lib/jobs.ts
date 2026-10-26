import db from "@db";
import { createLogger } from "@logger";
import { sql } from "drizzle-orm";

const jobsLogger = createLogger("jobs");

export type Job<T = unknown> = {
	/** Also the advisory lock key, so it must be unique. */
	name: string;
	intervalMs: number;
	run: () => Promise<T>;
};

/**
 * Runs the job unless it is already running anywhere, on this or another
 * server instance; null when skipped. The lock lasts as long as the wrapping
 * transaction, so it is released even when the process dies mid-run.
 */
export const runJob = <T>(job: Job<T>) =>
	db.transaction(async (tx): Promise<T | null> => {
		const [row] = await tx.execute(
			sql`SELECT pg_try_advisory_xact_lock(hashtext(${job.name})) AS locked`,
		);
		if (row?.["locked"] !== true) {
			jobsLogger.debug("Skipped a job that is already running", {
				job: job.name,
			});
			return null;
		}
		return job.run();
	});

const runLogged = async (job: Job) => {
	try {
		await runJob(job);
	} catch (error) {
		jobsLogger.error("Job failed", { job: job.name, error });
	}
};

/** Runs each job now, then every `intervalMs`, for as long as the process lives. */
export const startJobs = (jobs: Job[]) => {
	for (const job of jobs) {
		void runLogged(job);
		setInterval(() => void runLogged(job), job.intervalMs);
	}
};
