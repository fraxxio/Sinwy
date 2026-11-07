import {
	API_ERROR_CODES,
	PAGE_LIMITS,
	type PageDetailDto,
	type PageDetailsInput,
	pageDetailsSchema,
} from "@sinwy/shared";
import { revalidateLogic } from "@tanstack/react-form";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { TriangleAlertIcon } from "lucide-react";
import { useState } from "react";
import {
	organizationTaglineQuery,
	storePage,
	updatePage,
} from "#/modules/org-dashboard/lib/page-queries";
import { publicPagePath } from "#/modules/org-dashboard/lib/pages";
import { ContentBox } from "#/shared/components/ContentBox";
import { SettingsSection } from "#/shared/components/SettingsSection";
import { Alert, AlertDescription } from "#/shared/components/ui/alert";
import { FieldError } from "#/shared/components/ui/field";
import { toast } from "#/shared/components/ui/toast";
import { handleOrganizationInactive } from "#/shared/lib/auth/organization-inactive";
import { showFieldError, useAppForm } from "#/shared/lib/form";

const toValues = (page: PageDetailDto): PageDetailsInput => ({
	title: page.title,
	slug: page.slug,
	seoTitle: page.seoTitle ?? "",
	seoDescription: page.seoDescription ?? "",
});

/** Details and SEO sections; one save for both. */
export function PageDetailsForm({
	organization,
	page,
	readOnly,
}: {
	organization: { id: string; slug: string };
	page: PageDetailDto;
	readOnly: boolean;
}) {
	const queryClient = useQueryClient();
	const router = useRouter();
	const tagline = useQuery(organizationTaglineQuery(organization.id));
	const [serverError, setServerError] = useState<string | null>(null);

	const form = useAppForm({
		defaultValues: toValues(page),
		validationLogic: revalidateLogic({ mode: "change" }),
		validators: { onDynamic: pageDetailsSchema },
		onSubmit: async ({ value }) => {
			setServerError(null);
			const saved = toValues(page);
			const changes = Object.fromEntries(
				Object.entries(value).filter(
					([key, next]) => next.trim() !== saved[key as keyof PageDetailsInput],
				),
			);
			if (!Object.keys(changes).length) {
				toast.add({ title: "No changes to save", timeout: 4_000 });
				return;
			}
			const res = await updatePage(organization.id, page.id, changes);
			if (res.isSuccess) {
				form.reset(toValues(res.data));
				await storePage(queryClient, organization.id, res.data);
				toast.add({ type: "success", title: "Page saved", timeout: 4_000 });
				return;
			}
			if (handleOrganizationInactive(res, router, queryClient)) return;
			if (res.code === API_ERROR_CODES.PAGE_SLUG_TAKEN)
				return showFieldError(form, "slug", res.message);
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
					id="details"
					title="Details"
					description="The page's name and the address it's published at."
				>
					<form.AppField name="title">
						{(field) => (
							<field.TextField
								label="Title"
								placeholder="About us"
								maxLength={PAGE_LIMITS.title}
								disabled={readOnly}
							/>
						)}
					</form.AppField>
					<form.AppField name="slug">
						{(field) => (
							<>
								<field.TextField
									label="Address"
									placeholder="about-us"
									maxLength={PAGE_LIMITS.slug}
									disabled={readOnly}
									description={`Published at ${publicPagePath(organization.slug, field.state.value || "…")}`}
								/>
								{page.status === "published" &&
									field.state.value.trim() !== page.slug && (
										<Alert className="-mt-2">
											<TriangleAlertIcon />
											<AlertDescription>
												The old address{" "}
												{publicPagePath(organization.slug, page.slug)} stops
												working once you save. Links to it won't redirect.
											</AlertDescription>
										</Alert>
									)}
							</>
						)}
					</form.AppField>
				</SettingsSection>

				<SettingsSection
					id="seo"
					title="Search engines"
					description="How the page shows up in search results and link previews. Leave a field empty to use the default shown."
				>
					<form.Subscribe selector={(state) => state.values.title}>
						{(title) => (
							<form.AppField name="seoTitle">
								{(field) => (
									<field.TextField
										label="SEO title"
										placeholder={title || "The page title"}
										maxLength={PAGE_LIMITS.seoTitle}
										disabled={readOnly}
										counter
									/>
								)}
							</form.AppField>
						)}
					</form.Subscribe>
					<form.AppField name="seoDescription">
						{(field) => (
							<field.TextareaField
								label="SEO description"
								placeholder={
									tagline.data ??
									"No description: add a tagline to your business profile, or write one here."
								}
								maxLength={PAGE_LIMITS.seoDescription}
								disabled={readOnly}
								rows={3}
							/>
						)}
					</form.AppField>
				</SettingsSection>
				{!readOnly && (
					<div className="grid max-w-3xl gap-2 pt-8">
						{serverError && <FieldError>{serverError}</FieldError>}
						<form.AppForm>
							<form.SubmitButton
								label="Save changes"
								pendingLabel="Saving…"
								className="w-fit"
							/>
						</form.AppForm>
					</div>
				)}
			</ContentBox>
		</form>
	);
}
