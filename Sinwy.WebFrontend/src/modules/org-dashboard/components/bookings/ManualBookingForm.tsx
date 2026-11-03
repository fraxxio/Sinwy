import {
	BOOKING_LIMITS,
	type ManualBookingInput,
	type ServiceDto,
} from "@sinwy/shared";
import { revalidateLogic, useStore } from "@tanstack/react-form";
import { useState } from "react";
import { BookingTimeField } from "#/modules/org-dashboard/components/bookings/BookingTimeField";
import {
	bookingTimeValue,
	contactFormValues,
	type ManualBookingFormValues,
	manualBookingFormSchema,
} from "#/modules/org-dashboard/lib/booking-forms";
import { formatDuration } from "#/modules/org-dashboard/lib/services";
import { ContentBox } from "#/shared/components/ContentBox";
import { SettingsSection } from "#/shared/components/SettingsSection";
import { FieldError } from "#/shared/components/ui/field";
import { todayIn } from "#/shared/lib/date";
import { useAppForm } from "#/shared/lib/form";
import { formatMinorUnits } from "#/shared/lib/money";

/** A phone or walk-in booking; `onSubmit` resolves with an error message to show, or null when it worked. */
export function ManualBookingForm({
	organizationId,
	timezone,
	services,
	initialStart,
	onSubmit,
}: {
	organizationId: string;
	timezone: string;
	services: ServiceDto[];
	/** An ISO instant, from a click on the calendar. */
	initialStart?: string | undefined;
	onSubmit: (input: ManualBookingInput) => Promise<string | null>;
}) {
	const [error, setError] = useState<string | null>(null);
	const schema = manualBookingFormSchema(timezone);
	const defaultValues: ManualBookingFormValues = {
		serviceId: "",
		when: bookingTimeValue(
			todayIn(timezone),
			initialStart ? { iso: initialStart, timezone, custom: false } : undefined,
		),
		...contactFormValues(),
		internalNote: "",
	};
	const form = useAppForm({
		defaultValues,
		validationLogic: revalidateLogic({ mode: "change" }),
		validators: { onDynamic: schema },
		onSubmit: async ({ value }) => {
			setError(await onSubmit(schema.parse(value)));
		},
	});
	const serviceId = useStore(form.store, (state) => state.values.serviceId);
	const serviceOptions = services
		.filter((service) => service.isActive)
		.map((service) => ({
			value: service.id,
			label: `${service.name} · ${formatDuration(service.durationMinutes)} · ${formatMinorUnits(service.priceMinor, service.currency)}`,
		}));

	return (
		<form
			onSubmit={(e) => {
				e.preventDefault();
				void form.handleSubmit();
			}}
		>
			<ContentBox className="divide-y">
				<SettingsSection
					id="when"
					title="Service and time"
					description="Pick a free time, or type any time with Custom time. It can't overlap another booking."
				>
					<form.AppField name="serviceId">
						{(field) => (
							<field.SelectField
								label="Service"
								options={serviceOptions}
								placeholder="Pick a service"
							/>
						)}
					</form.AppField>
					<form.Field name="when">
						{(field) => (
							<BookingTimeField
								organizationId={organizationId}
								timezone={timezone}
								serviceId={serviceId || null}
								value={field.state.value}
								onChange={field.handleChange}
								error={
									field.form.state.submissionAttempts > 0
										? field.state.meta.errors[0]?.message
										: undefined
								}
							/>
						)}
					</form.Field>
				</SettingsSection>

				<SettingsSection
					id="customer"
					title="Customer"
					description="A name, plus an email or a phone. With an email, they get the confirmation."
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
					<div className="grid gap-4 sm:grid-cols-2">
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
					</div>
					<form.AppField name="internalNote">
						{(field) => (
							<field.TextareaField
								label="Internal note (optional)"
								description="Only your team sees it."
								maxLength={BOOKING_LIMITS.note}
								rows={3}
							/>
						)}
					</form.AppField>
				</SettingsSection>

				<div className="space-y-3 pt-8">
					{error && <FieldError>{error}</FieldError>}
					<form.AppForm>
						<form.SubmitButton
							label="Create booking"
							pendingLabel="Creating…"
						/>
					</form.AppForm>
				</div>
			</ContentBox>
		</form>
	);
}
