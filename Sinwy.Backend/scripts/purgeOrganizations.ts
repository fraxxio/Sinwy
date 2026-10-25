import { runJob } from "@backend/lib/jobs";
import { purgeOrganizationsJob } from "@organizationsModule";

if (import.meta.main) {
	const result = await runJob(purgeOrganizationsJob);
	console.log(
		result
			? JSON.stringify(result, null, "\t")
			: "Skipped: the purge is already running elsewhere.",
	);
	process.exit(0);
}
