import type { OrganizationDto } from "@sinwy/shared";
import { useForm } from "@tanstack/react-form";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { authClient } from "#/modules/auth/lib/auth-client";
import { FormInput } from "#/shared/components/FormInput";
import { Button } from "#/shared/components/ui/button";
import { api } from "#/shared/lib/api";

export const Route = createFileRoute("/organizations/new")({
	// ponytail: client-only — authClient can't read cookies during SSR; nothing here needs SSR
	ssr: false,
	beforeLoad: async () => {
		const { data } = await authClient.getSession();
		if (!data) throw redirect({ to: "/auth/login" });
	},
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

	const form = useForm({
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
					<FormInput
						form={form}
						name="name"
						label="Organization name"
						autoComplete="organization"
					/>

					{serverError && (
						<p className="text-sm text-destructive">{serverError}</p>
					)}

					<form.Subscribe selector={(state) => state.isSubmitting}>
						{(isSubmitting) => (
							<Button type="submit" className="w-full" disabled={isSubmitting}>
								{isSubmitting ? "Creating…" : "Create organization"}
							</Button>
						)}
					</form.Subscribe>
				</form>
			</div>
		</main>
	);
}
