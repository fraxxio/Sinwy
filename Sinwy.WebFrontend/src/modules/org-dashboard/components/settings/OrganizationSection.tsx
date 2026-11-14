import {
	ORGANIZATION_NAME_MAX,
	type OrganizationGeneralDto,
	organizationNameInputSchema,
} from "@sinwy/shared";
import { revalidateLogic } from "@tanstack/react-form";
import { Building2Icon, CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";
import { useUnwrapWrite } from "#/modules/org-dashboard/lib/service-queries";
import {
	logoPath,
	renameOrganization,
	useRefreshGeneral,
} from "#/modules/org-dashboard/lib/settings-queries";
import { ImageUpload } from "#/shared/components/ImageUpload";
import { SettingsSection } from "#/shared/components/SettingsSection";
import { Button } from "#/shared/components/ui/button";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldLabel,
} from "#/shared/components/ui/field";
import { Input } from "#/shared/components/ui/input";
import { toast } from "#/shared/components/ui/toast";
import { useAppForm } from "#/shared/lib/form";

export function OrganizationSection({
	general,
}: {
	general: OrganizationGeneralDto;
}) {
	const refresh = useRefreshGeneral(general.id);
	const unwrap = useUnwrapWrite();
	const [serverError, setServerError] = useState<string | null>(null);

	const form = useAppForm({
		defaultValues: { name: general.name },
		validationLogic: revalidateLogic({ mode: "change" }),
		validators: { onDynamic: organizationNameInputSchema },
		onSubmit: async ({ value }) => {
			setServerError(null);
			try {
				const saved = unwrap(await renameOrganization(general.id, value));
				form.reset(saved);
				await refresh();
				toast.add({ type: "success", title: "Name saved", timeout: 4_000 });
			} catch (error) {
				setServerError((error as Error).message || null);
			}
		},
	});

	return (
		<SettingsSection
			id="organization"
			title="Organization"
			description="The name and logo customers and your team see."
		>
			<div className="grid gap-6 sm:grid-cols-[auto_1fr] sm:gap-10">
				<ImageUpload
					path={logoPath(general.id)}
					image={general.logo}
					alt={`${general.name} logo`}
					fallback={<Building2Icon className="size-8" />}
					className="rounded-lg after:rounded-lg *:rounded-lg"
					onChange={refresh}
				/>
				<div className="grid content-start gap-6">
					<form
						noValidate
						className="grid gap-2"
						onSubmit={(e) => {
							e.preventDefault();
							void form.handleSubmit();
						}}
					>
						<form.AppField name="name">
							{(field) => (
								<field.TextField
									label="Name"
									autoComplete="organization"
									maxLength={ORGANIZATION_NAME_MAX}
								/>
							)}
						</form.AppField>
						{serverError && <FieldError>{serverError}</FieldError>}
						<form.AppForm>
							<form.SubmitButton
								label="Save name"
								pendingLabel="Saving…"
								className="w-fit"
							/>
						</form.AppForm>
					</form>
					<SlugField slug={general.slug} />
				</div>
			</div>
		</SettingsSection>
	);
}

function SlugField({ slug }: { slug: string }) {
	const [copied, setCopied] = useState(false);
	const copy = async () => {
		await navigator.clipboard.writeText(slug);
		setCopied(true);
		setTimeout(() => setCopied(false), 2_000);
	};

	return (
		<Field>
			<FieldLabel htmlFor="organization-slug">Address</FieldLabel>
			<div className="flex gap-2">
				<Input id="organization-slug" value={slug} readOnly />
				<Button
					type="button"
					variant="outline"
					size="icon"
					aria-label={copied ? "Copied" : "Copy address"}
					onClick={() => void copy()}
				>
					{copied ? <CheckIcon /> : <CopyIcon />}
				</Button>
			</div>
			<FieldDescription>
				Your booking page lives at /{slug}. Contact support to change it.
			</FieldDescription>
		</Field>
	);
}
