import { type PageDetailDto, pageContentSize } from "@sinwy/shared";
import { Link } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { EyeIcon, LayoutTemplateIcon, PencilIcon } from "lucide-react";
import { SettingsSection } from "#/shared/components/SettingsSection";
import { Button } from "#/shared/components/ui/button";

/** What the latest version holds, with the way into the page builder. */
export function PageContentSummary({
	organizationSlug,
	page,
	canWrite,
}: {
	organizationSlug: string;
	page: PageDetailDto;
	canWrite: boolean;
}) {
	const { latestVersion } = page;
	const count = pageContentSize(latestVersion.content);
	const noun = latestVersion.content.schemaVersion === 2 ? "block" : "widget";

	return (
		<SettingsSection
			id="content"
			title="Content"
			description="What's on the page."
			action={
				<div className="flex gap-2">
					{canWrite && (
						<Button
							nativeButton={false}
							render={
								<Link
									to="/dashboard/$organizationSlug/pages/$id/edit"
									params={{ organizationSlug, id: page.id }}
								/>
							}
						>
							<PencilIcon />
							Edit
						</Button>
					)}
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
				</div>
			}
		>
			<div className="flex items-center gap-4 rounded-md border border-dashed p-6">
				<LayoutTemplateIcon
					className="size-8 shrink-0 text-muted-foreground"
					aria-hidden
				/>
				<div className="grid gap-1 text-sm">
					<p className="font-medium">
						Version {latestVersion.version} · {count} {noun}
						{count === 1 ? "" : "s"}
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
