import { parseArgs } from "node:util";
import { planFor } from "@backend/infrastructure/polar";
import { listEntitledSubscriptions } from "@billingModule";
import db from "@db";
import { organization } from "@db/schema/organizationSchema";
import { and, eq, isNull } from "drizzle-orm";

const isActiveAndUnbound = and(
	eq(organization.status, "active"),
	isNull(organization.subscriptionId),
);

/**
 * One-off for organizations activated before migration 0008 added `plan` and
 * `subscription_id`: binds each active, unbound organization to its entitled
 * Polar subscription. Writes only with `apply`; organizations Polar has no
 * entitled subscription for are reported and left as they are.
 */
export const backfillSubscriptionBindings = async ({
	apply,
}: {
	apply: boolean;
}) => {
	const unbound = await db
		.select({ id: organization.id, slug: organization.slug })
		.from(organization)
		.where(isActiveAndUnbound);

	const report = [];
	for (const org of unbound) {
		const [subscription, ...others] = await listEntitledSubscriptions(org.id);
		if (!subscription) {
			report.push({ ...org, result: "no entitled subscription in Polar" });
			continue;
		}

		const plan = planFor(subscription.productId);
		if (apply)
			await db
				.update(organization)
				.set({
					plan,
					subscriptionId: subscription.id,
					subscriptionStatusAt:
						subscription.modifiedAt ?? subscription.createdAt,
				})
				// a webhook may have bound it since the read
				.where(and(eq(organization.id, org.id), isActiveAndUnbound));
		report.push({
			...org,
			result: apply ? "bound" : "would bind",
			subscriptionId: subscription.id,
			plan,
			...(others.length > 0 && {
				ignoredSubscriptionIds: others.map((other) => other.id),
			}),
		});
	}
	return report;
};

if (import.meta.main) {
	const { values } = parseArgs({
		options: { apply: { type: "boolean", default: false } },
	});
	const report = await backfillSubscriptionBindings({ apply: values.apply });
	console.log(JSON.stringify(report, null, "\t"));
	if (!values.apply && report.length > 0)
		console.log("Dry run; pass --apply to write.");
	process.exit(0);
}
