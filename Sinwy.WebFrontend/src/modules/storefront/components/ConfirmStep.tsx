import {
	BOOKING_LIMITS,
	customerCancelDeadline,
	customerNoteSchema,
	customerPhoneSchema,
	type PublicServiceDto,
} from "@sinwy/shared";
import { revalidateLogic } from "@tanstack/react-form";
import { useState } from "react";
import { z } from "zod";
import { ContentBox } from "#/shared/components/ContentBox";
import { Button } from "#/shared/components/ui/button";
import { FieldError } from "#/shared/components/ui/field";
import { formatCancellationPolicy } from "#/shared/lib/cancellation-policy";
import { formatDateIn, formatTimeIn } from "#/shared/lib/date";
import { useAppForm } from "#/shared/lib/form";
import { formatMinorUnits } from "#/shared/lib/money";
import { fromText } from "#/shared/lib/text-schema";

const confirmSchema = z.object({
	customerPhone: fromText(customerPhoneSchema),
	customerNote: fromText(customerNoteSchema),
});

export type ConfirmValues = z.infer<typeof confirmSchema>;

/** What a failed confirm shows, and whether the time has to be picked again. */
export type ConfirmError = { message: string; timeGone: boolean };

/** The summary, an optional phone and note, and the button that books; `onConfirm` resolves with an error or null. */
export function ConfirmStep({
	service,
	startsAt,
	timezone,
	organizationName,
	onConfirm,
	onPickAnotherTime,
}: {
	service: PublicServiceDto;
	startsAt: string;
	timezone: string;
	organizationName: string;
	onConfirm: (values: ConfirmValues) => Promise<ConfirmError | null>;
	onPickAnotherTime: () => void;
}) {
	const [error, setError] = useState<ConfirmError | null>(null);
	const cancelDeadline = customerCancelDeadline({
		status: "confirmed",
		startsAt,
		cancellationWindowMinutes: service.cancellationWindowMinutes,
	});
	const insideWindow =
		cancelDeadline !== null && Date.now() >= cancelDeadline.getTime();
	const form = useAppForm({
		defaultValues: { customerPhone: "", customerNote: "" },
		validationLogic: revalidateLogic({ mode: "change" }),
		validators: { onDynamic: confirmSchema },
		onSubmit: async ({ value }) => {
			setError(await onConfirm(confirmSchema.parse(value)));
		},
	});

	return (
		<form
			onSubmit={(e) => {
				e.preventDefault();
				void form.handleSubmit();
			}}
		>
			<ContentBox className="gap-6">
				<dl className="grid gap-3 text-sm sm:grid-cols-[8rem_1fr]">
					<dt className="text-muted-foreground">Service</dt>
					<dd>
						{service.name}, {service.durationMinutes} min
					</dd>
					<dt className="text-muted-foreground">When</dt>
					<dd>
						{formatDateIn(startsAt, timezone)} at{" "}
						{formatTimeIn(startsAt, timezone)}{" "}
						<span className="text-muted-foreground">({timezone})</span>
					</dd>
					<dt className="text-muted-foreground">Price</dt>
					<dd>{formatMinorUnits(service.priceMinor, service.currency)}</dd>
				</dl>
				{service.requiresApproval && (
					<p className="rounded-lg bg-muted p-3 text-sm">
						{organizationName} confirms this service before it's booked. You'll
						get an email when they do.
					</p>
				)}
				<p className="text-sm text-muted-foreground">
					{formatCancellationPolicy(service.cancellationWindowMinutes)}.
					{insideWindow &&
						" This time is already that close, so once it's confirmed you can't cancel it online."}
				</p>
				<form.AppField name="customerPhone">
					{(field) => (
						<field.TextField
							label="Phone (optional)"
							type="tel"
							autoComplete="tel"
							maxLength={BOOKING_LIMITS.customerPhone}
							description="In case the business needs to reach you."
						/>
					)}
				</form.AppField>
				<form.AppField name="customerNote">
					{(field) => (
						<field.TextareaField
							label="Note for the business (optional)"
							maxLength={BOOKING_LIMITS.note}
						/>
					)}
				</form.AppField>
				{error && (
					<div className="space-y-2">
						<FieldError>{error.message}</FieldError>
						{error.timeGone && (
							<Button
								type="button"
								variant="outline"
								onClick={onPickAnotherTime}
							>
								Pick another time
							</Button>
						)}
					</div>
				)}
				<form.AppForm>
					<form.SubmitButton
						label={
							service.requiresApproval ? "Send request" : "Confirm booking"
						}
						pendingLabel="Booking…"
					/>
				</form.AppForm>
			</ContentBox>
		</form>
	);
}
