import type { PageListItemDto } from "@sinwy/shared";
import { Link } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { ExternalLinkIcon } from "lucide-react";
import {
	PAGE_STATE_LABELS,
	type PageState,
	pageState,
	publicPagePath,
} from "#/modules/org-dashboard/lib/pages";
import { Badge } from "#/shared/components/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/shared/components/ui/table";

const STATE_BADGES: Record<PageState, "secondary" | "outline" | "destructive"> =
	{ live: "secondary", draft: "outline", "not-live": "destructive" };

export function PagesTable({
	organizationSlug,
	pages,
}: {
	organizationSlug: string;
	pages: PageListItemDto[];
}) {
	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Title</TableHead>
					<TableHead>Address</TableHead>
					<TableHead>Status</TableHead>
					<TableHead>Last edited</TableHead>
					<TableHead>
						<span className="sr-only">Public link</span>
					</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{pages.map((page) => {
					const state = pageState(page);
					const path = publicPagePath(organizationSlug, page.slug);
					return (
						<TableRow key={page.id}>
							<TableCell className="font-medium">
								<Link
									to="/dashboard/$organizationSlug/pages/$id"
									params={{ organizationSlug, id: page.id }}
									className="hover:underline"
								>
									{page.title}
								</Link>
							</TableCell>
							<TableCell className="text-muted-foreground">
								/{page.slug}
							</TableCell>
							<TableCell>
								<Badge variant={STATE_BADGES[state]}>
									{PAGE_STATE_LABELS[state]}
								</Badge>
							</TableCell>
							<TableCell className="text-muted-foreground">
								<time
									dateTime={page.updatedAt}
									title={new Date(page.updatedAt).toLocaleString()}
								>
									{formatDistanceToNow(page.updatedAt, { addSuffix: true })}
								</time>
							</TableCell>
							<TableCell className="w-0 text-right">
								{state === "live" && (
									<a
										href={path}
										target="_blank"
										rel="noreferrer"
										className="inline-flex items-center gap-1 text-sm hover:underline"
									>
										View
										<ExternalLinkIcon className="size-3.5" aria-hidden />
										<span className="sr-only">{path} (opens in a new tab)</span>
									</a>
								)}
							</TableCell>
						</TableRow>
					);
				})}
			</TableBody>
		</Table>
	);
}
