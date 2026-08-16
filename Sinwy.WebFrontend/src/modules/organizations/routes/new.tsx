import {
	FunnelStep,
	ORGANIZATION_INDUSTRIES,
	ORGANIZATION_INDUSTRY_OPTIONS,
	type OrganizationDto,
} from "@sinwy/shared";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { protectedRoute } from "#/modules/auth/lib/protected-route";
import { FunnelProgress } from "#/modules/organizations/components/FunnelProgress";
import { postLoginFlagsKey } from "#/modules/user/lib/usePostLoginFlags";
import { FieldError } from "#/shared/components/ui/field";
import { Skeleton } from "#/shared/components/ui/skeleton";
import { api } from "#/shared/lib/api";
import { useAppForm } from "#/shared/lib/form";
import { cn } from "#/shared/lib/utils";

export const Route = createFileRoute("/organizations/new")({
	...protectedRoute,
	component: NewOrganizationPage,
	pendingComponent: NewOrganizationPending,
	pendingMs: 0,
});

function PageShell({ children }: { children: React.ReactNode }) {
	return (
		<main className="page-wrap py-14">
			<div className="mx-auto w-full max-w-sm">
				<FunnelProgress current={FunnelStep.Create} className="mb-8" />

				<div className="mb-6 space-y-1.5">
					<h1 className="text-2xl font-bold tracking-tight">
						Create your organization
					</h1>
					<p className="text-sm text-muted-foreground">
						You can change this later. Next, you'll pick a plan.
					</p>
				</div>

				{children}
			</div>
		</main>
	);
}

function FieldSkeleton({ labelWidth }: { labelWidth: string }) {
	return (
		<div className="grid gap-2">
			<div className="flex h-5 items-center">
				<Skeleton className={cn("h-3.5 rounded-md", labelWidth)} />
			</div>
			<Skeleton className="h-10 rounded-md" />
			<div className="min-h-5" />
		</div>
	);
}

function NewOrganizationPending() {
	return (
		<PageShell>
			<div className="grid gap-4">
				<FieldSkeleton labelWidth="w-36" />
				<FieldSkeleton labelWidth="w-20" />
				<Skeleton className="h-9 rounded-md" />
			</div>
		</PageShell>
	);
}

const createOrgSchema = z.object({
	name: z
		.string()
		.trim()
		.min(1, "Name is required")
		.max(100, "Max 100 characters"),
	industry: z
		.string()
		.min(1, "Industry is required")
		.pipe(z.enum(ORGANIZATION_INDUSTRIES)),
});

function NewOrganizationPage() {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [serverError, setServerError] = useState<string | null>(null);

	const form = useAppForm({
		defaultValues: { name: "", industry: "" },
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
			await queryClient.invalidateQueries({ queryKey: postLoginFlagsKey });
			await navigate({
				to: "/organizations/$id/plan",
				params: { id: response.data.id },
			});
		},
	});

	return (
		<PageShell>
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

				<form.AppField name="industry">
					{(field) => (
						<field.SelectField
							label="Industry"
							options={ORGANIZATION_INDUSTRY_OPTIONS}
							placeholder="Select your industry"
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
		</PageShell>
	);
}
