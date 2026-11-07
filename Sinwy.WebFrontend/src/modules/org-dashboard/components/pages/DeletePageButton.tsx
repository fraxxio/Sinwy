import type { PageDetailDto } from "@sinwy/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Trash2Icon } from "lucide-react";
import { useState } from "react";
import {
	deletePage,
	forgetPage,
} from "#/modules/org-dashboard/lib/page-queries";
import { useUnwrapWrite } from "#/modules/org-dashboard/lib/service-queries";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "#/shared/components/ui/alert-dialog";
import { Button } from "#/shared/components/ui/button";
import { toast } from "#/shared/components/ui/toast";

export function DeletePageButton({
	organization,
	page,
}: {
	organization: { id: string; slug: string };
	page: PageDetailDto;
}) {
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const unwrap = useUnwrapWrite();
	const [open, setOpen] = useState(false);

	const remove = useMutation({
		mutationFn: async () => unwrap(await deletePage(organization.id, page.id)),
		onSuccess: async () => {
			setOpen(false);
			toast.add({
				type: "success",
				title: `${page.title} deleted`,
				timeout: 4_000,
			});
			await navigate({
				to: "/dashboard/$organizationSlug/pages",
				params: { organizationSlug: organization.slug },
			});
			await forgetPage(queryClient, organization.id, page.id);
		},
		onError: (error) => {
			setOpen(false);
			if (error.message)
				toast.add({ type: "error", title: error.message, timeout: 6_000 });
		},
	});

	return (
		<>
			<Button type="button" variant="outline" onClick={() => setOpen(true)}>
				<Trash2Icon />
				Delete
			</Button>
			<AlertDialog
				open={open}
				onOpenChange={(next) => !remove.isPending && setOpen(next)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete {page.title}?</AlertDialogTitle>
						<AlertDialogDescription>
							{page.status === "published"
								? "The page goes offline right away and its address stops working. "
								: ""}
							Its content and every saved version are deleted for good.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={remove.isPending}>
							Cancel
						</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							disabled={remove.isPending}
							onClick={() => remove.mutate()}
						>
							{remove.isPending ? "Deleting…" : "Delete page"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
