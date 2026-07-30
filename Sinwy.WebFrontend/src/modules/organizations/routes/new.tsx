import type { OrganizationDto } from "@sinwy/shared";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { protectedRoute } from "#/modules/auth/lib/protected-route";
import { FieldError } from "#/shared/components/ui/field";
import { api } from "#/shared/lib/api";
import { useAppForm } from "#/shared/lib/form";

export const Route = createFileRoute("/organizations/new")({
	...protectedRoute,
	component: NewOrganizationPage,
});

const createOrgSchema = z.object({
	name: z
		.string()
		.trim()
		.min(1, "Name is required")
		.max(100, "Max 100 characters"),
});

function NewOrganizationPage() {
	const navigate = useNavigate();
	const [serverError, setServerError] = useState<string | null>(null);

	const form = useAppForm({
		defaultValues: { name: "" },
		validators: { onSubmit: createOrgSchema },
		onSubmit: async ({ value }) => {
			setServerError(null);
			const response = await api<OrganizationDto>("/organizations", {
				method: "POST",
				body: JSON.stringify(value),
			});
			if (!response.isSuccess) {
				setServerError(response.message);
				return;
			}
			await navigate({
				to: "/organizations/$id/plan",
				params: { id: response.data.id },
			});
		},
	});

	return (
		<main className="page-wrap py-14">
			<div className="mx-auto w-full max-w-sm">
				<div className="mb-6 space-y-1.5">
					<h1 className="text-2xl font-bold tracking-tight">
						Name your organization
					</h1>
					<p className="text-sm text-muted-foreground">
						You can change this later. Next, you'll pick a plan.
					</p>
				</div>

				<form
					className="grid gap-4"
					onSubmit={(e) => {
						e.preventDefault();
						void form.handleSubmit();
					}}
				>
					<form.AppField name="name">
						{(field) => (
							<field.TextField
								label="Organization name"
								autoComplete="organization"
							/>
						)}
					</form.AppField>

					{serverError && <FieldError>{serverError}</FieldError>}

					<form.AppForm>
						<form.SubmitButton
							label="Create organization"
							pendingLabel="Creating…"
						/>
					</form.AppForm>
				</form>
			</div>
		</main>
	);
}
