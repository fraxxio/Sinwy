import {
	COUNTRY_OPTIONS,
	ORGANIZATION_PROFILE_LIMITS as LIMITS,
	type OrganizationProfileDto,
	organizationProfileSchema,
} from "@sinwy/shared";
import { revalidateLogic } from "@tanstack/react-form";
import { useState } from "react";
import { FieldError } from "#/shared/components/ui/field";
import { useAppForm } from "#/shared/lib/form";

export type BusinessProfileValues = Record<
	keyof OrganizationProfileDto,
	string
>;

const toFormValues = (
	profile: OrganizationProfileDto,
): BusinessProfileValues => ({
	tagline: profile.tagline ?? "",
	description: profile.description ?? "",
	email: profile.email ?? "",
	phone: profile.phone ?? "",
	website: profile.website ?? "",
	city: profile.city ?? "",
	country: profile.country ?? "",
});

/** `onSubmit` resolves with an error message to show, or null when it worked. */
export function BusinessProfileForm({
	profile,
	submitLabel,
	pendingLabel,
	onSubmit,
	children,
}: {
	profile: OrganizationProfileDto;
	submitLabel: string;
	pendingLabel: string;
	onSubmit: (values: BusinessProfileValues) => Promise<string | null>;
	children?: React.ReactNode;
}) {
	const [serverError, setServerError] = useState<string | null>(null);

	const form = useAppForm({
		defaultValues: toFormValues(profile),
		// errors surface under the field on blur or on submit, never mid-typing
		validationLogic: revalidateLogic({ mode: "change" }),
		validators: { onDynamic: organizationProfileSchema },
		onSubmit: async ({ value }) => {
			setServerError(await onSubmit(value));
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
			<form.AppField name="tagline">
				{(field) => (
					<field.TextField
						label="Tagline"
						placeholder="Sharp cuts, no waiting"
						description="One line customers see next to your name."
						maxLength={LIMITS.tagline}
					/>
				)}
			</form.AppField>

			<form.AppField name="description">
				{(field) => (
					<field.TextareaField
						label="About your business"
						placeholder="What you do, who you do it for, what makes you different."
						description="Your page and your listing both start from this."
						maxLength={LIMITS.description}
						rows={4}
					/>
				)}
			</form.AppField>

			<div className="grid gap-4 sm:grid-cols-2">
				<form.AppField name="email">
					{(field) => (
						<field.TextField
							label="Contact email"
							type="email"
							placeholder="hello@yourbusiness.com"
							autoComplete="email"
						/>
					)}
				</form.AppField>

				<form.AppField name="phone">
					{(field) => (
						<field.TextField
							label="Phone"
							type="tel"
							placeholder="+370 600 00000"
							description="Include your country code so customers abroad can reach you."
							autoComplete="tel"
							maxLength={LIMITS.phone}
						/>
					)}
				</form.AppField>
			</div>

			<form.AppField name="website">
				{(field) => (
					<field.TextField
						label="Website (optional)"
						placeholder="yourbusiness.com"
						description="Already have one? We'll link to it."
						autoComplete="url"
					/>
				)}
			</form.AppField>

			<div className="grid gap-4 sm:grid-cols-2">
				<form.AppField name="city">
					{(field) => (
						<field.TextField
							label="City"
							placeholder="Vilnius"
							autoComplete="address-level2"
							maxLength={LIMITS.city}
						/>
					)}
				</form.AppField>

				<form.AppField name="country">
					{(field) => (
						<field.ComboboxField
							label="Country"
							options={COUNTRY_OPTIONS}
							placeholder="Select your country"
						/>
					)}
				</form.AppField>
			</div>

			{serverError && <FieldError>{serverError}</FieldError>}

			<form.AppForm>
				<form.SubmitButton label={submitLabel} pendingLabel={pendingLabel} />
			</form.AppForm>

			{children}
		</form>
	);
}
