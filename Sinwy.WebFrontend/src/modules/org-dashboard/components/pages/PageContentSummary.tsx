import type { PageDetailDto } from "@sinwy/shared";
import { Link } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { EyeIcon, LayoutTemplateIcon } from "lucide-react";
import { SettingsSection } from "#/shared/components/SettingsSection";
import { Button } from "#/shared/components/ui/button";

/** Where the page builder goes; until then it shows what the latest version holds. */
export function PageContentSummary({
	organizationSlug,
	page,
}: {
	organizationSlug: string;
	page: PageDetailDto;
}) {
	const { latestVersion } = page;
	const widgets = latestVersion.content.widgets.length;

	return (
		<SettingsSection
			id="content"
			title="Content"
			description="What's on the page. Editing it comes with the page builder."
			action={
				<Button
					variant="outline"
					nativeButton={false}
					render={
						<Link
							to="/dashboard/$organizationSlug/pages/$id/preview"
							params={{ organizationSlug, id: page.id }}
						/>
					}
				>
					<EyeIcon />
					Preview
				</Button>
			}
		>
			<div className="flex items-center gap-4 rounded-md border border-dashed p-6">
				<LayoutTemplateIcon
					className="size-8 shrink-0 text-muted-foreground"
					aria-hidden
				/>
				<div className="grid gap-1 text-sm">
					<p className="font-medium">
						Version {latestVersion.version} · {widgets}{" "}
						{widgets === 1 ? "widget" : "widgets"}
					</p>
					<p className="text-muted-foreground">
						Last saved{" "}
						<time
							dateTime={latestVersion.createdAt}
							title={new Date(latestVersion.createdAt).toLocaleString()}
						>
							{formatDistanceToNow(latestVersion.createdAt, {
								addSuffix: true,
							})}
						</time>
					</p>
				</div>
			</div>
		</SettingsSection>
	);
}
