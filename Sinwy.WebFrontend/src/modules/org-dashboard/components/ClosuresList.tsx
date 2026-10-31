import {
	AVAILABILITY_LIMITS,
	type ClosureDto,
	closureSchema,
} from "@sinwy/shared";
import { revalidateLogic } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
	type ClosureFormValues,
	closureFormSchema,
	formatLocalDate,
	todayIn,
} from "#/modules/org-dashboard/lib/business-hours";
import {
	addClosure,
	removeClosure,
	serviceKeys,
	useUnwrapWrite,
} from "#/modules/org-dashboard/lib/service-queries";
import { SettingsSection } from "#/shared/components/SettingsSection";
import { Button } from "#/shared/components/ui/button";
import { FieldError } from "#/shared/components/ui/field";
import { toast } from "#/shared/components/ui/toast";
import { useAppForm } from "#/shared/lib/form";

const EMPTY: ClosureFormValues = { date: "", note: "" };

/** Upcoming whole-day closures; writers add and remove them. */
export function ClosuresList({
	organizationId,
	timezone,
	closures,
	readOnly,
}: {
	organizationId: string;
	timezone: string;
	closures: ClosureDto[];
	readOnly: boolean;
}) {
	const queryClient = useQueryClient();
	const unwrap = useUnwrapWrite();
	const [serverError, setServerError] = useState<string | null>(null);
	const today = todayIn(timezone);
	const schema = closureFormSchema(today);

	const invalidate = () =>
		queryClient.invalidateQueries({
			queryKey: serviceKeys.availability(organizationId),
		});

	const form = useAppForm({
		defaultValues: EMPTY,
		validationLogic: revalidateLogic({ mode: "change" }),
		validators: { onDynamic: schema },
		onSubmit: async ({ value }) => {
			try {
				unwrap(await addClosure(organizationId, closureSchema.parse(value)));
				setServerError(null);
				form.reset(EMPTY);
				await invalidate();
			} catch (error) {
				setServerError((error as Error).message || null);
			}
		},
	});

	const remove = useMutation({
		mutationFn: async (closureId: string) =>
			unwrap(await removeClosure(organizationId, closureId)),
		onError: (error) => {
			if (error.message)
				toast.add({ type: "error", title: error.message, timeout: 6_000 });
		},
		onSettled: invalidate,
	});

	return (
		<SettingsSection
			id="closures"
			title="Closures"
			description="Whole days you're closed, like holidays. Nobody can book on them."
		>
			{!readOnly && (
				<form
					className="grid gap-x-4 sm:grid-cols-[12rem_1fr_auto] sm:items-start"
					onSubmit={(e) => {
						e.preventDefault();
						void form.handleSubmit();
					}}
				>
					<form.AppField name="date">
						{(field) => (
							<field.TextField label="Date" type="date" min={today} />
						)}
					</form.AppField>
					<form.AppField name="note">
						{(field) => (
							<field.TextField
								label="Note (optional)"
								placeholder="Holiday"
								maxLength={AVAILABILITY_LIMITS.closureNote}
							/>
						)}
					</form.AppField>
					<form.AppForm>
						<form.SubmitButton
							label="Add closure"
							pendingLabel="Adding…"
							className="w-fit sm:mt-6"
						/>
					</form.AppForm>
					{serverError && (
						<FieldError className="sm:col-span-3">{serverError}</FieldError>
					)}
				</form>
			)}

			{closures.length === 0 ? (
				<p className="text-muted-foreground text-sm">No upcoming closures.</p>
			) : (
				<ul className="divide-y rounded-lg border">
					{closures.map((closure) => (
						<li
							key={closure.id}
							className="flex min-h-12 items-center justify-between gap-4 px-4 py-2 text-sm"
						>
							<div className="flex flex-wrap items-baseline gap-x-3">
								<span className="font-medium">
									{formatLocalDate(closure.date)}
								</span>
								{closure.note && (
									<span className="text-muted-foreground">{closure.note}</span>
								)}
							</div>
							{!readOnly && (
								<Button
									type="button"
									variant="ghost"
									size="sm"
									disabled={remove.isPending && remove.variables === closure.id}
									onClick={() => remove.mutate(closure.id)}
									aria-label={`Remove closure on ${formatLocalDate(closure.date)}`}
								>
									Remove
								</Button>
							)}
						</li>
					))}
				</ul>
			)}
		</SettingsSection>
	);
}
