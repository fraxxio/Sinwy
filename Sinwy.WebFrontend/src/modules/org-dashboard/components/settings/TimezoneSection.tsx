import {
	type OrganizationGeneralDto,
	organizationTimezoneInputSchema,
} from "@sinwy/shared";
import { revalidateLogic } from "@tanstack/react-form";
import { useMemo, useState } from "react";
import { timeZoneOptions } from "#/modules/org-dashboard/lib/business-hours";
import { useUnwrapWrite } from "#/modules/org-dashboard/lib/service-queries";
import {
	changeTimezone,
	useRefreshGeneral,
} from "#/modules/org-dashboard/lib/settings-queries";
import { SettingsSection } from "#/shared/components/SettingsSection";
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
import { FieldError } from "#/shared/components/ui/field";
import { toast } from "#/shared/components/ui/toast";
import { useAppForm } from "#/shared/lib/form";

const label = (zone: string) => zone.replaceAll("_", " ");

export function TimezoneSection({
	general,
}: {
	general: OrganizationGeneralDto;
}) {
	const refresh = useRefreshGeneral(general.id);
	const unwrap = useUnwrapWrite();
	const [pending, setPending] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const [serverError, setServerError] = useState<string | null>(null);
	const timeZones = useMemo(
		() => timeZoneOptions(general.timezone),
		[general.timezone],
	);

	const form = useAppForm({
		defaultValues: { timezone: general.timezone },
		validationLogic: revalidateLogic({ mode: "change" }),
		validators: { onDynamic: organizationTimezoneInputSchema },
		onSubmit: ({ value }) => {
			setServerError(null);
			if (value.timezone !== general.timezone) setPending(value.timezone);
		},
	});

	const confirm = async () => {
		if (!pending) return;
		setSaving(true);
		try {
			const saved = unwrap(
				await changeTimezone(general.id, { timezone: pending }),
			);
			form.reset(saved);
			await refresh();
			toast.add({ type: "success", title: "Timezone saved", timeout: 4_000 });
		} catch (error) {
			setServerError((error as Error).message || null);
		} finally {
			setSaving(false);
			setPending(null);
		}
	};

	return (
		<SettingsSection
			id="timezone"
			title="Timezone"
			description="Your business hours, closures and booking times follow this clock."
		>
			<form
				noValidate
				className="grid gap-2"
				onSubmit={(e) => {
					e.preventDefault();
					void form.handleSubmit();
				}}
			>
				<form.AppField name="timezone">
					{(field) => (
						<field.ComboboxField
							label="Timezone"
							options={timeZones}
							placeholder="Search timezones"
						/>
					)}
				</form.AppField>
				{serverError && <FieldError>{serverError}</FieldError>}
				<form.AppForm>
					<form.SubmitButton
						label="Change timezone"
						pendingLabel="Saving…"
						className="w-fit"
					/>
				</form.AppForm>
			</form>
			<AlertDialog
				open={pending !== null}
				onOpenChange={(open) => !saving && !open && setPending(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							Change the timezone to {pending && label(pending)}?
						</AlertDialogTitle>
						<AlertDialogDescription>
							Your business hours stay at the same clock times, now in{" "}
							{pending && label(pending)}. Existing bookings keep their moment,
							so they may show at a different local time. Analytics already
							recorded stay in {label(general.timezone)}.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
						<AlertDialogAction disabled={saving} onClick={() => void confirm()}>
							{saving ? "Saving…" : "Change timezone"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</SettingsSection>
	);
}
