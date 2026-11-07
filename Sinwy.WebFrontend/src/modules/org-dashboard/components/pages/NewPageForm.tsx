import {
	API_ERROR_CODES,
	type CreatePageInput,
	createPageSchema,
	PAGE_LIMITS,
} from "@sinwy/shared";
import { revalidateLogic } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { TemplatePicker } from "#/modules/org-dashboard/components/pages/TemplatePicker";
import { createPage, pageKeys } from "#/modules/org-dashboard/lib/page-queries";
import {
	publicPagePath,
	slugFromTitle,
} from "#/modules/org-dashboard/lib/pages";
import { ContentBox } from "#/shared/components/ContentBox";
import { SettingsSection } from "#/shared/components/SettingsSection";
import { FieldError } from "#/shared/components/ui/field";
import { toast } from "#/shared/components/ui/toast";
import { handleOrganizationInactive } from "#/shared/lib/auth/organization-inactive";
import { showFieldError, useAppForm } from "#/shared/lib/form";

const DEFAULT_VALUES: CreatePageInput = {
	templateId: "blank",
	title: "",
	slug: "",
};

export function NewPageForm({
	organization,
}: {
	organization: { id: string; slug: string };
}) {
	const queryClient = useQueryClient();
	const router = useRouter();
	const navigate = useNavigate();
	const [serverError, setServerError] = useState<string | null>(null);
	// the address follows the title until someone types their own
	const slugEdited = useRef(false);

	const form = useAppForm({
		defaultValues: DEFAULT_VALUES,
		validationLogic: revalidateLogic({ mode: "change" }),
		validators: { onDynamic: createPageSchema },
		onSubmit: async ({ value }) => {
			setServerError(null);
			const res = await createPage(organization.id, value);
			if (res.isSuccess) {
				queryClient.setQueryData(
					pageKeys.detail(organization.id, res.data.id),
					res.data,
				);
				await queryClient.invalidateQueries({
					queryKey: pageKeys.list(organization.id),
					refetchType: "all",
				});
				toast.add({ type: "success", title: "Page created", timeout: 4_000 });
				await navigate({
					to: "/dashboard/$organizationSlug/pages/$id",
					params: { organizationSlug: organization.slug, id: res.data.id },
				});
				return;
			}
			if (handleOrganizationInactive(res, router, queryClient)) return;
			if (res.code === API_ERROR_CODES.PAGE_SLUG_TAKEN)
				return showFieldError(form, "slug", res.message);
			// the route swaps the form for the limit notice once the list catches up
			if (res.code === API_ERROR_CODES.PAGE_LIMIT_REACHED)
				void queryClient.invalidateQueries({
					queryKey: pageKeys.list(organization.id),
				});
			setServerError(res.message);
		},
	});

	return (
		<form
			onSubmit={(e) => {
				e.preventDefault();
				void form.handleSubmit();
			}}
		>
			<ContentBox className="divide-y">
				<SettingsSection
					id="template"
					title="Template"
					description="What the page starts with, filled in from your organization's profile. You can change everything afterwards."
				>
					<form.Field name="templateId">
						{(field) => (
							<TemplatePicker
								value={field.state.value}
								onChange={field.handleChange}
							/>
						)}
					</form.Field>
				</SettingsSection>

				<SettingsSection
					id="details"
					title="Details"
					description="The page's name and the address it's published at."
				>
					<form.AppField
						name="title"
						listeners={{
							onChange: ({ value }) => {
								if (slugEdited.current) return;
								form.setFieldValue("slug", slugFromTitle(value), {
									dontRunListeners: true,
								});
							},
						}}
					>
						{(field) => (
							<field.TextField
								label="Title"
								placeholder="About us"
								maxLength={PAGE_LIMITS.title}
							/>
						)}
					</form.AppField>
					<form.AppField
						name="slug"
						listeners={{
							onChange: ({ value }) => {
								slugEdited.current = value !== "";
							},
						}}
					>
						{(field) => (
							<field.TextField
								label="Address"
								placeholder="about-us"
								maxLength={PAGE_LIMITS.slug}
								description={`Published at ${publicPagePath(organization.slug, field.state.value || "…")}`}
							/>
						)}
					</form.AppField>
				</SettingsSection>

				<div className="grid max-w-3xl gap-2 pt-8">
					{serverError && <FieldError>{serverError}</FieldError>}
					<form.AppForm>
						<form.SubmitButton
							label="Create page"
							pendingLabel="Creating…"
							className="w-fit"
						/>
					</form.AppForm>
				</div>
			</ContentBox>
		</form>
	);
}
