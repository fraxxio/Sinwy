import {
	type PageListItemDto,
	type PageUsageDto,
	PLAN_LIMITS,
} from "@sinwy/shared";
import { InfoIcon } from "lucide-react";
import { pageState } from "#/modules/org-dashboard/lib/pages";
import { UpgradeAction } from "#/shared/components/UpgradePrompt";
import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "#/shared/components/ui/alert";
import { getPlanName, minimumPlanForPages } from "#/shared/lib/plans";
import { cn } from "#/shared/lib/utils";

export function PageUsageMeter({ usage }: { usage: PageUsageDto }) {
	const share = usage.limit ? Math.min(usage.used / usage.limit, 1) : 1;

	return (
		<div className="grid w-40 gap-1.5">
			<p className="text-muted-foreground text-sm">
				{usage.used} of {usage.limit} pages used
			</p>
			<div className="h-1.5 overflow-hidden rounded-full bg-muted">
				<div
					className={cn(
						"h-full rounded-full bg-primary",
						usage.used > usage.limit && "bg-destructive",
					)}
					style={{ width: `${share * 100}%` }}
				/>
			</div>
		</div>
	);
}

const pagesWord = (count: number) => (count === 1 ? "page" : "pages");

/** At the limit (for writers) or over it after a downgrade (for everyone). */
export function PageLimitNotice({
	usage,
	pages,
	canWrite,
}: {
	usage: PageUsageDto;
	pages: PageListItemDto[];
	canWrite: boolean;
}) {
	const over = usage.used > usage.limit;
	if (!over && (!canWrite || usage.used < usage.limit)) return null;

	const offline = pages.filter((page) => pageState(page) === "not-live");
	const plan = minimumPlanForPages(over ? usage.used : usage.used + 1);

	const title = over
		? `Your pages are over your plan's limit of ${usage.limit}`
		: "You've used every page your plan includes";

	const upgrade = plan
		? `${getPlanName(plan)} includes up to ${PLAN_LIMITS[plan].pages} pages${over ? ", enough to put them all back online" : ""}.`
		: "No plan includes more pages.";

	return (
		<Alert className="mb-4">
			<InfoIcon />
			<AlertTitle>{title}</AlertTitle>
			<AlertDescription className="grid gap-3">
				{over && (
					<p>
						Only the oldest {usage.limit} published {pagesWord(usage.limit)}{" "}
						{usage.limit === 1 ? "stays" : "stay"} online.
						{offline.length > 0 &&
							` Offline now: ${offline.map((page) => page.title).join(", ")}.`}{" "}
						Delete pages to get back under the limit, or upgrade.
					</p>
				)}
				<p>{upgrade}</p>
				{plan && (
					<div>
						<UpgradeAction />
					</div>
				)}
			</AlertDescription>
		</Alert>
	);
}
