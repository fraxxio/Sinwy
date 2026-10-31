import type { AvailabilityInput } from "@sinwy/shared";
import { type AnyFieldApi, revalidateLogic } from "@tanstack/react-form";
import { CopyIcon } from "lucide-react";
import { useMemo, useState } from "react";
import {
	type BusinessHoursFormValues,
	businessHoursFormSchema,
	copyMondayToWeekdays,
	timeZoneOptions,
	toAvailabilityInput,
	WEEKDAYS,
} from "#/modules/org-dashboard/lib/business-hours";
import { SettingsSection } from "#/shared/components/SettingsSection";
import { Button } from "#/shared/components/ui/button";
import { FieldError } from "#/shared/components/ui/field";
import { Input } from "#/shared/components/ui/input";
import { Switch } from "#/shared/components/ui/switch";
import { fieldErrorState } from "#/shared/lib/field-error";
import { useAppForm } from "#/shared/lib/form";

const fieldError = (field: AnyFieldApi) =>
	fieldErrorState({
		isBlurred: field.state.meta.isBlurred,
		submissionAttempts: field.form.state.submissionAttempts,
		errors: field.state.meta.errors,
		value: field.state.value,
	}).error;

function TimeInput({ field, label }: { field: AnyFieldApi; label: string }) {
	const error = fieldError(field);
	return (
		<div className="grid gap-1">
			<Input
				type="time"
				step={900}
				aria-label={label}
				name={field.name}
				value={field.state.value}
				onBlur={field.handleBlur}
				onChange={(e) => field.handleChange(e.target.value)}
				aria-invalid={!!error}
				className="w-32"
			/>
			{error && <FieldError className="text-xs">{error}</FieldError>}
		</div>
	);
}

/** `onSubmit` resolves with an error message to show, or null when it worked. */
export function BusinessHoursForm({
	values,
	readOnly,
	onSubmit,
}: {
	values: BusinessHoursFormValues;
	readOnly: boolean;
	onSubmit: (input: AvailabilityInput) => Promise<string | null>;
}) {
	const [serverError, setServerError] = useState<string | null>(null);
	const timeZones = useMemo(
		() => timeZoneOptions(values.timezone),
		[values.timezone],
	);

	const form = useAppForm({
		defaultValues: values,
		validationLogic: revalidateLogic({ mode: "change" }),
		validators: { onDynamic: businessHoursFormSchema },
		onSubmit: async ({ value }) => {
			setServerError(await onSubmit(toAvailabilityInput(value)));
		},
	});

	const hasHours = values.days.some((day) => day.open);

	return (
		<form
			className="pb-8"
			onSubmit={(e) => {
				e.preventDefault();
				void form.handleSubmit();
			}}
		>
			<fieldset disabled={readOnly} className="contents divide-y">
				<SettingsSection
					id="timezone"
					title="Timezone"
					description="Your hours and closures follow this clock."
				>
					<form.AppField name="timezone">
						{(field) => (
							<field.ComboboxField
								label="Timezone"
								options={timeZones}
								placeholder="Search timezones"
								disabled={readOnly}
							/>
						)}
					</form.AppField>
				</SettingsSection>

				<SettingsSection
					id="weekly"
					title="Weekly hours"
					description="When customers can book, one range per day."
					action={
						!readOnly && (
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() =>
									form.setFieldValue(
										"days",
										copyMondayToWeekdays(form.getFieldValue("days")),
									)
								}
							>
								<CopyIcon />
								Copy Monday to weekdays
							</Button>
						)
					}
				>
					{!hasHours && (
						<p className="rounded-lg border border-dashed px-4 py-3 text-muted-foreground text-sm">
							Every day is closed, so customers can't book yet.
							{!readOnly && " Open the days you work and save."}
						</p>
					)}
					<div className="divide-y">
						{WEEKDAYS.map((name, i) => (
							<form.Field key={name} name={`days[${i}].open`}>
								{(openField) => (
									<div className="flex min-h-14 flex-wrap items-start gap-x-6 gap-y-2 py-2">
										<div className="flex h-10 w-36 items-center gap-3">
											<Switch
												id={`day-${i}-open`}
												checked={openField.state.value}
												onCheckedChange={(checked) =>
													openField.handleChange(checked)
												}
												disabled={readOnly}
											/>
											<label
												htmlFor={`day-${i}-open`}
												className="font-medium text-sm"
											>
												{name}
											</label>
										</div>
										{openField.state.value ? (
											<div className="flex items-start gap-2">
												<form.Field name={`days[${i}].start`}>
													{(field) => (
														<TimeInput field={field} label={`${name} opens`} />
													)}
												</form.Field>
												<span className="flex h-10 items-center text-muted-foreground">
													–
												</span>
												<form.Field name={`days[${i}].end`}>
													{(field) => (
														<TimeInput field={field} label={`${name} closes`} />
													)}
												</form.Field>
											</div>
										) : (
											<span className="flex h-10 items-center text-muted-foreground text-sm">
												Closed
											</span>
										)}
									</div>
								)}
							</form.Field>
						))}
					</div>
					{!readOnly && (
						<div className="grid gap-2">
							{serverError && <FieldError>{serverError}</FieldError>}
							<form.AppForm>
								<form.SubmitButton
									label="Save hours"
									pendingLabel="Saving…"
									className="w-fit"
								/>
							</form.AppForm>
						</div>
					)}
				</SettingsSection>
			</fieldset>
		</form>
	);
}
