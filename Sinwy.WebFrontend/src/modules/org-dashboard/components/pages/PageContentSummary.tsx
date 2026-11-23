import { blocksIn, type PageDetailDto } from "@sinwy/shared";
import { Link } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { EyeIcon, LayoutTemplateIcon, PencilIcon } from "lucide-react";
import { SettingsSection } from "#/shared/components/SettingsSection";
import { Button } from "#/shared/components/ui/button";

/** What the latest version holds, with the way into the editor and the preview. */
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
	const { count } = blocksIn(latestVersion.content);

	return (
		<SettingsSection
			id="content"
			title="Content"
			description="What's on the page. Change it in the editor; visitors see it once you publish."
			action={
				<div className="flex flex-wrap gap-2">
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
							Edit content
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
						{count} {count === 1 ? "block" : "blocks"}
					</p>
					<p className="text-muted-foreground">
						Last saved{" "}
						<time
							dateTime={latestVersion.savedAt}
							title={new Date(latestVersion.savedAt).toLocaleString()}
						>
							{formatDistanceToNow(latestVersion.savedAt, {
								addSuffix: true,
							})}
						</time>
					</p>
				</div>
			</div>
		</SettingsSection>
	);
}
