import type { PublicServiceDto } from "@sinwy/shared";
import { createContext, useContext } from "react";
import {
	Combobox,
	ComboboxChip,
	ComboboxChips,
	ComboboxChipsInput,
	ComboboxContent,
	ComboboxEmpty,
	ComboboxItem,
	ComboboxList,
	ComboboxValue,
	useComboboxAnchor,
} from "#/shared/components/ui/combobox";

/** The organization's services, for editor fields; Puck doesn't pass `metadata` to custom fields. */
export const BuilderServicesContext = createContext<PublicServiceDto[]>([]);

export function ServicePicker({
	value,
	onChange,
}: {
	value: string[] | undefined;
	onChange: (value: string[]) => void;
}) {
	const services = useContext(BuilderServicesContext);
	const anchor = useComboboxAnchor();
	const selected = (value ?? []).flatMap((id) =>
		services.filter((service) => service.id === id),
	);

	return (
		<div className="grid gap-1.5">
			<Combobox
				multiple
				items={services}
				value={selected}
				itemToStringLabel={(service: PublicServiceDto) => service.name}
				isItemEqualToValue={(a: PublicServiceDto, b: PublicServiceDto) =>
					a.id === b.id
				}
				onValueChange={(next: PublicServiceDto[]) =>
					onChange(next.map((service) => service.id))
				}
			>
				<ComboboxChips ref={anchor}>
					<ComboboxValue>
						{(chosen: PublicServiceDto[]) =>
							chosen.map((service) => (
								<ComboboxChip key={service.id}>{service.name}</ComboboxChip>
							))
						}
					</ComboboxValue>
					<ComboboxChipsInput
						placeholder={selected.length ? "" : "All services"}
					/>
				</ComboboxChips>
				<ComboboxContent anchor={anchor}>
					<ComboboxEmpty>No services found.</ComboboxEmpty>
					<ComboboxList>
						{(service: PublicServiceDto) => (
							<ComboboxItem key={service.id} value={service}>
								{service.name}
							</ComboboxItem>
						)}
					</ComboboxList>
				</ComboboxContent>
			</Combobox>
			<p className="text-muted-foreground text-xs">
				Leave empty to show every service.
			</p>
		</div>
	);
}
