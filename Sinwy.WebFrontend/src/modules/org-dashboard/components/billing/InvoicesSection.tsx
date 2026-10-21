import type {
	InvoiceBillingReason,
	InvoiceDto,
	InvoiceStatus,
} from "@sinwy/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2Icon } from "lucide-react";
import { useState } from "react";
import {
	billingKeys,
	invoicesQuery,
	openPolarPortal,
	requestInvoiceDownload,
} from "#/modules/org-dashboard/lib/billing-queries";
import {
	downloadInvoice,
	type InvoiceDownloadResult,
} from "#/modules/org-dashboard/lib/download-invoice";
import { SettingsSection } from "#/shared/components/SettingsSection";
import { Badge } from "#/shared/components/ui/badge";
import { Button } from "#/shared/components/ui/button";
import { FieldError } from "#/shared/components/ui/field";
import { Skeleton } from "#/shared/components/ui/skeleton";
import { toast } from "#/shared/components/ui/toast";
import { formatMinorUnits } from "#/shared/lib/money";

const STATUS_LABELS: Record<InvoiceStatus, string | null> = {
	paid: null,
	pending: "Pending",
	draft: "Draft",
	void: "Void",
	refunded: "Refunded",
	partially_refunded: "Partially refunded",
};

const REASON_LABELS: Record<InvoiceBillingReason, string> = {
	purchase: "Purchase",
	subscription_create: "First payment",
	subscription_cycle: "Renewal",
	subscription_update: "Plan change",
};

const day = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

export function InvoicesSection({
	organizationId,
	page,
	onPageChange,
}: {
	organizationId: string;
	page: number;
	onPageChange: (page: number) => void;
}) {
	const { data, isPending, isError, isFetching, refetch } = useQuery(
		invoicesQuery(organizationId, page),
	);

	const pageCount = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

	return (
		<SettingsSection
			id="invoices"
			title="Invoices"
			description="Every payment for this organization's plan."
		>
			{isPending ? (
				<Skeleton className="h-24" />
			) : isError ? (
				<div className="flex items-center gap-3">
					<FieldError>Couldn't load your invoices.</FieldError>
					<Button
						type="button"
						variant="link"
						size="sm"
						className="h-auto p-0"
						disabled={isFetching}
						onClick={() => void refetch()}
					>
						{isFetching ? "Retrying…" : "Retry"}
					</Button>
				</div>
			) : data.total === 0 ? (
				<p className="text-muted-foreground text-sm">No invoices yet.</p>
			) : data.items.length === 0 ? (
				<div className="flex items-center gap-3 text-muted-foreground text-sm">
					<p>No invoices on this page.</p>
					<Button
						type="button"
						variant="link"
						size="sm"
						className="h-auto p-0"
						onClick={() => onPageChange(1)}
					>
						Go to the first page
					</Button>
				</div>
			) : (
				<>
					<ul className="divide-y">
						{data.items.map((invoice) => (
							<InvoiceRow
								key={invoice.id}
								organizationId={organizationId}
								invoice={invoice}
							/>
						))}
					</ul>
					{pageCount > 1 && (
						<div className="mt-4 flex items-center justify-between gap-4 text-muted-foreground text-sm">
							<span>
								Page {page} of {pageCount}
							</span>
							<div className="flex gap-2">
								<Button
									type="button"
									variant="outline"
									size="sm"
									disabled={page <= 1}
									onClick={() => onPageChange(page - 1)}
								>
									Previous
								</Button>
								<Button
									type="button"
									variant="outline"
									size="sm"
									disabled={page >= pageCount}
									onClick={() => onPageChange(page + 1)}
								>
									Next
								</Button>
							</div>
						</div>
					)}
				</>
			)}
		</SettingsSection>
	);
}

function InvoiceRow({
	organizationId,
	invoice,
}: {
	organizationId: string;
	invoice: InvoiceDto;
}) {
	const queryClient = useQueryClient();
	// after a 202 the next click should find the file
	const [requested, setRequested] = useState(false);
	const expectsFile = invoice.invoiceGenerated || requested;

	const download = useMutation({
		mutationFn: () =>
			downloadInvoice(() => requestInvoiceDownload(organizationId, invoice.id)),
		onSuccess: (result: InvoiceDownloadResult) => {
			switch (result.kind) {
				case "downloading":
					if (!invoice.invoiceGenerated)
						void queryClient.invalidateQueries({
							queryKey: billingKeys.invoices(organizationId),
						});
					return;
				case "generating":
					setRequested(true);
					toast.add({
						type: "info",
						title: "Generating your invoice",
						description: "Try again in a few seconds.",
					});
					return;
				case "needs-details":
					toast.add({
						type: "error",
						title: "Couldn't generate the invoice",
						description: result.message,
						timeout: 10_000,
						actionProps: {
							children: "Add billing details on Polar",
							onClick: () =>
								void openPolarPortal().catch((e: Error) =>
									toast.add({
										type: "error",
										title: "Couldn't open billing",
										description: e.message,
									}),
								),
						},
					});
					return;
				case "error":
					toast.add({
						type: "error",
						title: "Couldn't download the invoice",
						description: result.message,
					});
			}
		},
	});

	const status = STATUS_LABELS[invoice.status];

	return (
		<li className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
			<div className="grid gap-0.5 text-sm">
				<div className="flex flex-wrap items-center gap-2">
					<span className="font-medium">{invoice.number}</span>
					{status && <Badge variant="outline">{status}</Badge>}
				</div>
				<span className="text-muted-foreground text-xs">
					{day.format(new Date(invoice.createdAt))} ·{" "}
					{REASON_LABELS[invoice.billingReason]}
				</span>
			</div>
			<div className="flex items-center gap-3">
				<span className="text-sm tabular-nums">
					{formatMinorUnits(invoice.totalAmount, invoice.currency)}
				</span>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					disabled={download.isPending}
					aria-label={`${expectsFile ? "Download" : "Generate"} invoice ${invoice.number}`}
					onClick={() => download.mutate()}
				>
					{download.isPending && (
						<Loader2Icon data-icon="inline-start" className="animate-spin" />
					)}
					{expectsFile ? "Download" : "Generate"}
				</Button>
			</div>
		</li>
	);
}
