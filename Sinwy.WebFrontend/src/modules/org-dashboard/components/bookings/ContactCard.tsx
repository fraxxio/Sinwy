import { BOOKING_LIMITS, type BookingDto } from "@sinwy/shared";
import { revalidateLogic } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
	contactFormSchema,
	contactFormValues,
} from "#/modules/org-dashboard/lib/booking-forms";
import {
	invalidateBookings,
	updateBooking,
} from "#/modules/org-dashboard/lib/booking-queries";
import { useUnwrapWrite } from "#/modules/org-dashboard/lib/service-queries";
import { FlatCard } from "#/shared/components/FlatCard";
import { Button } from "#/shared/components/ui/button";
import {
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/shared/components/ui/card";
import { FieldError } from "#/shared/components/ui/field";
import { toast } from "#/shared/components/ui/toast";
import { useAppForm } from "#/shared/lib/form";

/** Who booked. Staff edit the contact of manual bookings; a self-booking's comes from the customer's account. */
export function ContactCard({
	organizationId,
	booking,
	canWrite,
}: {
	organizationId: string;
	booking: BookingDto;
	canWrite: boolean;
}) {
	const [editing, setEditing] = useState(false);
	const fromAccount = booking.bookedBy === "customer";

	return (
		<FlatCard>
			<CardHeader>
				<CardTitle>Customer</CardTitle>
				<CardDescription>
					{!fromAccount
						? "Added by your team"
						: booking.customerUserId
							? "From the customer's account"
							: "From a customer account that has since been deleted"}
				</CardDescription>
				{canWrite && !fromAccount && !editing && (
					<CardAction>
						<Button
							variant="outline"
							size="sm"
							onClick={() => setEditing(true)}
						>
							Edit
						</Button>
					</CardAction>
				)}
			</CardHeader>
			<CardContent>
				{editing ? (
					<ContactForm
						organizationId={organizationId}
						booking={booking}
						onDone={() => setEditing(false)}
					/>
				) : (
					<dl className="grid gap-2 text-sm sm:grid-cols-[5rem_1fr]">
						<dt className="text-muted-foreground">Name</dt>
						<dd>{booking.customerName}</dd>
						<dt className="text-muted-foreground">Email</dt>
						<dd>
							{booking.customerEmail ? (
								<a
									className="underline-offset-4 hover:underline"
									href={`mailto:${booking.customerEmail}`}
								>
									{booking.customerEmail}
								</a>
							) : (
								"—"
							)}
						</dd>
						<dt className="text-muted-foreground">Phone</dt>
						<dd>
							{booking.customerPhone ? (
								<a
									className="underline-offset-4 hover:underline"
									href={`tel:${booking.customerPhone}`}
								>
									{booking.customerPhone}
								</a>
							) : (
								"—"
							)}
						</dd>
					</dl>
				)}
			</CardContent>
		</FlatCard>
	);
}

function ContactForm({
	organizationId,
	booking,
	onDone,
}: {
	organizationId: string;
	booking: BookingDto;
	onDone: () => void;
}) {
	const queryClient = useQueryClient();
	const unwrap = useUnwrapWrite();
	const [error, setError] = useState<string | null>(null);
	const form = useAppForm({
		defaultValues: contactFormValues(booking),
		validationLogic: revalidateLogic({ mode: "change" }),
		validators: { onDynamic: contactFormSchema },
		onSubmit: async ({ value }) => {
			try {
				unwrap(
					await updateBooking(
						organizationId,
						booking.id,
						contactFormSchema.parse(value),
					),
				);
				toast.add({ type: "success", title: "Contact saved", timeout: 4_000 });
				onDone();
			} catch (failure) {
				setError((failure as Error).message || null);
			} finally {
				void invalidateBookings(queryClient, organizationId);
			}
		},
	});

	return (
		<form
			className="grid gap-4"
			onSubmit={(e) => {
				e.preventDefault();
				void form.handleSubmit();
			}}
		>
			<form.AppField name="customerName">
				{(field) => (
					<field.TextField
						label="Name"
						autoComplete="off"
						maxLength={BOOKING_LIMITS.customerName}
					/>
				)}
			</form.AppField>
			<form.AppField name="customerEmail">
				{(field) => (
					<field.TextField
						label="Email"
						type="email"
						autoComplete="off"
						maxLength={BOOKING_LIMITS.customerEmail}
					/>
				)}
			</form.AppField>
			<form.AppField name="customerPhone">
				{(field) => (
					<field.TextField
						label="Phone"
						type="tel"
						autoComplete="off"
						maxLength={BOOKING_LIMITS.customerPhone}
					/>
				)}
			</form.AppField>
			{error && <FieldError>{error}</FieldError>}
			<div className="flex gap-2">
				<form.AppForm>
					<form.SubmitButton
						label="Save"
						pendingLabel="Saving…"
						className="w-fit"
					/>
				</form.AppForm>
				<Button type="button" variant="outline" onClick={onDone}>
					Cancel
				</Button>
			</div>
		</form>
	);
}
