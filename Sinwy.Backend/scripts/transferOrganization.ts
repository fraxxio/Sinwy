import { parseArgs } from "node:util";
import { transferOwnershipBySupport } from "@transfersModule";

if (import.meta.main) {
	const { values } = parseArgs({
		options: {
			org: { type: "string" },
			to: { type: "string" },
			apply: { type: "boolean", default: false },
		},
	});
	if (!values.org || !values.to) {
		console.error("Usage: --org <organizationId> --to <userId> [--apply]");
		process.exit(1);
	}
	const result = await transferOwnershipBySupport({
		organizationId: values.org,
		toUserId: values.to,
		apply: values.apply,
	});
	console.log(JSON.stringify(result, null, "\t"));
	if (result.ok && !result.applied)
		console.log("Dry run; pass --apply to write.");
	process.exit(result.ok ? 0 : 1);
}
