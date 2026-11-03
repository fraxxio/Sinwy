import { SERVICE_LIMITS as LIMITS, type ServiceInput } from "@sinwy/shared";
import { revalidateLogic } from "@tanstack/react-form";
import { ChevronDownIcon } from "lucide-react";
import { useState } from "react";
import {
	BUFFER_OPTIONS,
	CANCELLATION_WINDOW_OPTIONS,
	DURATION_OPTIONS,
	type ServiceFormValues,
	serviceFormSchema,
	toServiceInput,
} from "#/modules/org-dashboard/lib/services";
import { ContentBox } from "#/shared/components/ContentBox";
import { SettingsSection } from "#/shared/components/SettingsSection";
import { Button } from "#/shared/components/ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "#/shared/components/ui/collapsible";
import { FieldError } from "#/shared/components/ui/field";
import { Switch } from "#/shared/components/ui/switch";
import { useAppForm } from "#/shared/lib/form";

/** `onSubmit` resolves with an error message to show, or null when it worked. */
export function ServiceForm({
	values,
	currency,
	readOnly,
	submitLabel,
	pendingLabel,
	onSubmit,
}: {
	values: ServiceFormValues;
	currency: string;
	readOnly: boolean;
	submitLabel: string;
	pendingLabel: string;
	onSubmit: (input: ServiceInput) => Promise<string | null>;
}) {
	const [serverError, setServerError] = useState<string | null>(null);

	const form = useAppForm({
		defaultValues: values,
		validationLogic: revalidateLogic({ mode: "change" }),
		validators: { onDynamic: serviceFormSchema(currency) },
		onSubmit: async ({ value }) => {
			setServerError(await onSubmit(toServiceInput(value, currency)));
		},
	});

	const hasBuffers =
		values.bufferBeforeMinutes !== "0" || values.bufferAfterMinutes !== "0";

	return (
		<form
			onSubmit={(e) => {
				e.preventDefault();
				void form.handleSubmit();
			}}
		>
			<fieldset disabled={readOnly} className="contents">
				<ContentBox className="divide-y">
					<SettingsSection
						id="details"
						title="Details"
						description="What customers see when they choose a service."
					>
						<form.AppField name="name">
							{(field) => (
								<field.TextField
									label="Name"
									placeholder="Haircut"
									maxLength={LIMITS.name}
								/>
							)}
						</form.AppField>
						<form.AppField name="description">
							{(field) => (
								<field.TextareaField
									label="Description (optional)"
									placeholder="What's included and how to prepare."
									maxLength={LIMITS.description}
									rows={3}
								/>
							)}
						</form.AppField>
					</SettingsSection>

					<SettingsSection
						id="pricing"
						title="Pricing & duration"
						description={`Prices are in ${currency}, your organization's currency.`}
					>
						<div className="grid gap-4 sm:grid-cols-2">
							<form.AppField name="price">
								{(field) => (
									<field.TextField
										label={`Price (${currency})`}
										placeholder="25.00"
										inputMode="decimal"
									/>
								)}
							</form.AppField>
							<form.AppField name="durationMinutes">
								{(field) => (
									<field.SelectField
										label="Duration"
										options={DURATION_OPTIONS}
										disabled={readOnly}
									/>
								)}
							</form.AppField>
						</div>
					</SettingsSection>

					<SettingsSection
						id="bookings"
						title="Bookings"
						description="How bookings customers make themselves start out, and how late they can cancel."
					>
						<form.Field name="requiresApproval">
							{(field) => (
								<div className="flex items-center gap-3">
									<Switch
										id="requires-approval"
										checked={field.state.value}
										onCheckedChange={(checked) => field.handleChange(checked)}
										disabled={readOnly}
									/>
									<label htmlFor="requires-approval" className="text-sm">
										Approve each booking before it's confirmed
									</label>
								</div>
							)}
						</form.Field>
						<form.AppField name="cancellationWindowMinutes">
							{(field) => (
								<field.SelectField
									label="Cancellation window"
									options={CANCELLATION_WINDOW_OPTIONS}
									description="Customers can't cancel online during this time before the start."
									disabled={readOnly}
								/>
							)}
						</form.AppField>
					</SettingsSection>

					<SettingsSection
						id="advanced"
						title="Advanced"
						description="Breaks kept free around each appointment."
					>
						<Collapsible defaultOpen={hasBuffers}>
							<CollapsibleTrigger
								render={
									<Button
										type="button"
										variant="ghost"
										size="sm"
										className="group/trigger -ml-2"
									/>
								}
							>
								Buffers
								<ChevronDownIcon className="transition-transform group-data-[panel-open]/trigger:rotate-180" />
							</CollapsibleTrigger>
							<CollapsibleContent className="grid gap-4 pt-4 sm:grid-cols-2">
								<form.AppField name="bufferBeforeMinutes">
									{(field) => (
										<field.SelectField
											label="Buffer before"
											options={BUFFER_OPTIONS}
											disabled={readOnly}
										/>
									)}
								</form.AppField>
								<form.AppField name="bufferAfterMinutes">
									{(field) => (
										<field.SelectField
											label="Buffer after"
											options={BUFFER_OPTIONS}
											disabled={readOnly}
										/>
									)}
								</form.AppField>
							</CollapsibleContent>
						</Collapsible>
					</SettingsSection>

					{!readOnly && (
						<div className="grid max-w-3xl gap-2 pt-8">
							{serverError && <FieldError>{serverError}</FieldError>}
							<form.AppForm>
								<form.SubmitButton
									label={submitLabel}
									pendingLabel={pendingLabel}
									className="w-fit"
								/>
							</form.AppForm>
						</div>
					)}
				</ContentBox>
			</fieldset>
		</form>
	);
}
