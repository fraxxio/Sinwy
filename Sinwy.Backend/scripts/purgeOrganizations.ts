import { purgeOrganizationsJob } from "@backend/jobs";
import { runJob } from "@backend/lib/jobs";

if (import.meta.main) {
	const result = await runJob(purgeOrganizationsJob);
	console.log(
		result
			? JSON.stringify(result, null, "\t")
			: "Skipped: the purge is already running elsewhere.",
	);
	process.exit(0);
}
