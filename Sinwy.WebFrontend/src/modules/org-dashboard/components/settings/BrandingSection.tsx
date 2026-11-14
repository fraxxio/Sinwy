import {
	BRAND_COLOR_PATTERN,
	BRAND_FONT_LABELS,
	BRAND_FONTS,
	type BrandFont,
	type OrganizationBrandingDto,
	type OrganizationGeneralDto,
} from "@sinwy/shared";
import { CheckIcon } from "lucide-react";
import { useState } from "react";
import { useUnwrapWrite } from "#/modules/org-dashboard/lib/service-queries";
import {
	changeBranding,
	useRefreshGeneral,
} from "#/modules/org-dashboard/lib/settings-queries";
import { SettingsSection } from "#/shared/components/SettingsSection";
import { Button } from "#/shared/components/ui/button";
import { FieldError } from "#/shared/components/ui/field";
import { Input } from "#/shared/components/ui/input";
import { Label } from "#/shared/components/ui/label";
import { toast } from "#/shared/components/ui/toast";
import { BRAND_FONT_FAMILIES, brandAttributes } from "#/shared/lib/branding";
import { cn } from "#/shared/lib/utils";

const SWATCHES = [
	"#0f766e",
	"#2563eb",
	"#7c3aed",
	"#db2777",
	"#dc2626",
	"#ea580c",
	"#ca8a04",
	"#171717",
];

// what the native picker shows while Sinwy's default is in use
const PICKER_FALLBACK = "#047857";

const FONT_OPTIONS: { value: BrandFont | null; label: string }[] = [
	{ value: null, label: "Sinwy default" },
	...BRAND_FONTS.map((font) => ({
		value: font,
		label: BRAND_FONT_LABELS[font],
	})),
];

export function BrandingSection({
	general,
}: {
	general: OrganizationGeneralDto;
}) {
	const saved = general.branding;
	const refresh = useRefreshGeneral(general.id);
	const unwrap = useUnwrapWrite();
	const [font, setFont] = useState(saved.font);
	const [colorText, setColorText] = useState(saved.color ?? "");
	const [saving, setSaving] = useState(false);
	const [serverError, setServerError] = useState<string | null>(null);

	const typed = colorText.trim().toLowerCase();
	const colorValid = typed === "" || BRAND_COLOR_PATTERN.test(typed);
	const color = typed && colorValid ? typed : null;
	const draft: OrganizationBrandingDto = { color, font };
	const dirty = draft.color !== saved.color || draft.font !== saved.font;
	const isDefault = saved.color === null && saved.font === null;

	const save = async (branding: OrganizationBrandingDto) => {
		setSaving(true);
		setServerError(null);
		try {
			unwrap(await changeBranding(general.id, branding));
			await refresh();
			setColorText(branding.color ?? "");
			setFont(branding.font);
			toast.add({ type: "success", title: "Branding saved", timeout: 4_000 });
		} catch (error) {
			setServerError((error as Error).message || null);
		} finally {
			setSaving(false);
		}
	};

	return (
		<SettingsSection
			id="branding"
			title="Branding"
			description="Your accent color and font on your booking page and every published page."
			action={
				<Button
					variant="outline"
					size="sm"
					disabled={saving || isDefault}
					onClick={() => void save({ color: null, font: null })}
				>
					Reset to defaults
				</Button>
			}
		>
			<form
				noValidate
				className="grid gap-6"
				onSubmit={(e) => {
					e.preventDefault();
					if (colorValid && dirty) void save(draft);
				}}
			>
				<fieldset className="grid gap-3">
					<legend className="mb-3 font-medium text-sm">Accent color</legend>
					<div className="flex flex-wrap items-center gap-2">
						{SWATCHES.map((swatch) => (
							<button
								key={swatch}
								type="button"
								aria-label={`Use ${swatch}`}
								aria-pressed={color === swatch}
								onClick={() => setColorText(swatch)}
								className="grid size-8 place-items-center rounded-full border border-black/10 text-white"
								style={{ backgroundColor: swatch }}
							>
								{color === swatch && <CheckIcon className="size-4" />}
							</button>
						))}
					</div>
					<div className="flex items-center gap-2">
						<input
							type="color"
							aria-label="Pick a color"
							value={color ?? PICKER_FALLBACK}
							onChange={(e) => setColorText(e.target.value)}
							className="h-9 w-12 cursor-pointer rounded-md border bg-transparent p-1"
						/>
						<Label htmlFor="brand-color" className="sr-only">
							Hex color
						</Label>
						<Input
							id="brand-color"
							value={colorText}
							onChange={(e) => setColorText(e.target.value)}
							placeholder="Sinwy default"
							aria-invalid={!colorValid}
							className="w-36 font-mono"
						/>
						{colorText && (
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={() => setColorText("")}
							>
								Use default
							</Button>
						)}
					</div>
					{!colorValid && <FieldError>Use a color like #0f766e</FieldError>}
				</fieldset>

				<fieldset className="grid gap-2">
					<legend className="mb-3 font-medium text-sm">Font</legend>
					<div className="grid gap-2 sm:grid-cols-2">
						{FONT_OPTIONS.map((option) => (
							<label
								key={option.label}
								className={cn(
									"flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 has-focus-visible:ring-[3px] has-focus-visible:ring-ring/50",
									font === option.value && "border-primary bg-primary/5",
								)}
							>
								<input
									type="radio"
									name="brand-font"
									className="sr-only"
									checked={font === option.value}
									onChange={() => setFont(option.value)}
								/>
								<span
									className="text-base"
									style={
										option.value
											? { fontFamily: BRAND_FONT_FAMILIES[option.value] }
											: undefined
									}
								>
									{option.label}
								</span>
							</label>
						))}
					</div>
				</fieldset>

				<div className="grid gap-2">
					<p className="font-medium text-sm">Preview</p>
					<div
						{...brandAttributes(draft)}
						className="space-y-3 rounded-lg border bg-card p-6"
						data-testid="branding-preview"
					>
						<h3 className="font-heading font-semibold text-2xl tracking-tight">
							{general.name}
						</h3>
						<p className="text-muted-foreground text-sm">
							Pick a time that suits you and we'll see you soon.{" "}
							<span className="text-primary underline underline-offset-4">
								See all services
							</span>
						</p>
						<Button type="button" tabIndex={-1}>
							Book now
						</Button>
					</div>
				</div>

				{serverError && <FieldError>{serverError}</FieldError>}
				<Button
					type="submit"
					className="w-fit"
					disabled={saving || !dirty || !colorValid}
				>
					{saving ? "Saving…" : "Save branding"}
				</Button>
			</form>
		</SettingsSection>
	);
}
