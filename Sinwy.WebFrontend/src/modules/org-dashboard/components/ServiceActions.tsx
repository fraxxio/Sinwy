import type { ServiceDto } from "@sinwy/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArchiveIcon, CopyIcon, EllipsisIcon, PencilIcon } from "lucide-react";
import { useState } from "react";
import {
	archiveService,
	duplicateService,
	serviceKeys,
	useUnwrapWrite,
} from "#/modules/org-dashboard/lib/service-queries";
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
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "#/shared/components/ui/dropdown-menu";
import { toast } from "#/shared/components/ui/toast";

const toastError = (error: Error) => {
	if (error.message)
		toast.add({ type: "error", title: error.message, timeout: 6_000 });
};

/** Edit, Duplicate and Archive for one service; only rendered for writers. */
export function ServiceActions({
	organizationId,
	organizationSlug,
	service,
	showEdit,
	onArchived,
}: {
	organizationId: string;
	organizationSlug: string;
	service: ServiceDto;
	showEdit: boolean;
	onArchived?: () => void;
}) {
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const unwrap = useUnwrapWrite();
	const [confirmOpen, setConfirmOpen] = useState(false);
	const invalidate = () =>
		queryClient.invalidateQueries({
			queryKey: serviceKeys.all(organizationId),
		});

	const duplicate = useMutation({
		mutationFn: async () =>
			unwrap(await duplicateService(organizationId, service.id)),
		onSuccess: (copy) =>
			navigate({
				to: "/$organizationSlug/services/$id",
				params: { organizationSlug, id: copy.id },
			}),
		onError: toastError,
		onSettled: invalidate,
	});

	const archive = useMutation({
		mutationFn: async () =>
			unwrap(await archiveService(organizationId, service.id)),
		onSuccess: () => {
			setConfirmOpen(false);
			toast.add({
				type: "success",
				title: `${service.name} archived`,
				timeout: 4_000,
			});
			onArchived?.();
		},
		onError: (error) => {
			setConfirmOpen(false);
			toastError(error);
		},
		onSettled: invalidate,
	});

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger
					render={
						<Button
							type="button"
							variant="ghost"
							size="icon-sm"
							aria-label={`Actions for ${service.name}`}
						/>
					}
				>
					<EllipsisIcon />
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-fit">
					<DropdownMenuGroup>
						{showEdit && (
							<DropdownMenuItem
								render={
									<Link
										to="/$organizationSlug/services/$id"
										params={{ organizationSlug, id: service.id }}
									/>
								}
							>
								<PencilIcon />
								Edit
							</DropdownMenuItem>
						)}
						<DropdownMenuItem
							disabled={duplicate.isPending}
							onClick={() => duplicate.mutate()}
						>
							<CopyIcon />
							Duplicate
						</DropdownMenuItem>
					</DropdownMenuGroup>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						variant="destructive"
						onClick={() => setConfirmOpen(true)}
					>
						<ArchiveIcon />
						Archive
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<AlertDialog
				open={confirmOpen}
				onOpenChange={(open) => !archive.isPending && setConfirmOpen(open)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Archive {service.name}?</AlertDialogTitle>
						<AlertDialogDescription>
							It leaves your services list and customers can no longer book it.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={archive.isPending}>
							Cancel
						</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							disabled={archive.isPending}
							onClick={() => archive.mutate()}
						>
							{archive.isPending ? "Archiving…" : "Archive"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
