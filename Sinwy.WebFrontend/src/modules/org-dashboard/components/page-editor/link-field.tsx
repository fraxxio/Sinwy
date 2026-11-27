import { bookingLink, linkTarget, pageLink } from "@sinwy/shared";
import { use, useEffect, useId, useRef, useState } from "react";
import type { CustomFieldUi } from "#/shared/components/page-builder/puck-config";
import { Input } from "#/shared/components/ui/input";
import { Label } from "#/shared/components/ui/label";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/shared/components/ui/select";
import { cn } from "#/shared/lib/utils";
import {
	EditorField,
	EditorPagesContext,
	EditorServicesContext,
	usePuck,
} from "./editor-fields";
import {
	describeLink,
	LINK_CHOICES,
	type LinkChoice,
	linkedPage,
	typedWebLink,
} from "./links";

type Props = {
	label: string;
	href: string;
	onChange: (href: string) => void;
	readOnly?: boolean | undefined;
};

function ServicePicker({
	serviceId,
	onChange,
	readOnly,
}: {
	serviceId: string;
	onChange: (href: string) => void;
	readOnly?: boolean | undefined;
}) {
	const services = use(EditorServicesContext);
	const items = services.map((s) => ({ label: s.name, value: s.id }));
	return (
		<Select
			items={items}
			value={serviceId}
			disabled={readOnly}
			onValueChange={(next) => {
				if (next !== null && next !== serviceId) onChange(bookingLink(next));
			}}
		>
			<SelectTrigger aria-label="Service" className="w-full">
				<SelectValue placeholder="Choose a service" />
			</SelectTrigger>
			<SelectContent>
				<SelectGroup>
					{items.map((item) => (
						<SelectItem key={item.value} value={item.value}>
							{item.label}
						</SelectItem>
					))}
				</SelectGroup>
			</SelectContent>
		</Select>
	);
}

function PagePicker({
	pageId,
	onChange,
	readOnly,
}: {
	pageId: string | null;
	onChange: (href: string) => void;
	readOnly?: boolean | undefined;
}) {
	const pages = use(EditorPagesContext);
	const items = pages.map((p) => ({ label: p.title, value: p.id }));
	return (
		<Select
			items={items}
			value={pageId}
			disabled={readOnly}
			onValueChange={(next) => {
				if (next !== null && next !== pageId) onChange(pageLink(next));
			}}
		>
			<SelectTrigger aria-label="Page" className="w-full">
				<SelectValue placeholder="Choose a page" />
			</SelectTrigger>
			<SelectContent>
				<SelectGroup>
					{items.map((item) => (
						<SelectItem key={item.value} value={item.value}>
							{item.label}
						</SelectItem>
					))}
				</SelectGroup>
			</SelectContent>
		</Select>
	);
}

/** Keeps what the owner types, and writes it only once the server would accept it. */
function WebAddressInput({ href, onChange, readOnly }: Omit<Props, "label">) {
	const id = useId();
	const input = useRef<HTMLInputElement>(null);
	const [text, setText] = useState(href);
	const refused = typedWebLink(text) === null;
	useEffect(() => {
		if (input.current !== document.activeElement) setText(href);
	}, [href]);

	return (
		<div className="grid gap-1.5">
			<Label htmlFor={id} className="font-normal text-muted-foreground text-xs">
				Web address
			</Label>
			<Input
				ref={input}
				id={id}
				value={text}
				readOnly={readOnly}
				placeholder="example.com"
				aria-invalid={refused || undefined}
				aria-describedby={refused ? `${id}-error` : undefined}
				className={cn(readOnly && "bg-muted/60 text-muted-foreground")}
				onChange={(event) => {
					const next = event.currentTarget.value;
					setText(next);
					const link = typedWebLink(next);
					if (link !== null && link !== href) onChange(link);
				}}
			/>
			{refused && (
				<p id={`${id}-error`} className="text-destructive text-xs">
					Customers can't open this. Enter an address such as example.com, or
					one starting with https://, mailto: or tel:.
				</p>
			)}
		</div>
	);
}

function LinkPicker({ label, href, onChange, readOnly }: Props) {
	const services = use(EditorServicesContext);
	const pages = use(EditorPagesContext);
	const blockId = usePuck(
		(s) => s.selectedItem?.props.id as string | undefined,
	);
	const target = linkTarget(href);
	const { choice, words } = describeLink(target, services, pages);
	const noServices = services.length === 0;
	const noPages = pages.length === 0;
	const unavailable = (value: LinkChoice) =>
		(value === "service" && noServices) || (value === "page" && noPages);

	const choose = (next: LinkChoice) => {
		if (next === choice) return;
		if (next === "booking") onChange(bookingLink());
		if (next === "service" && services[0])
			onChange(bookingLink(services[0].id));
		if (next === "page" && pages[0]) onChange(pageLink(pages[0].id));
		if (next === "web") onChange("");
	};

	return (
		<EditorField label={label} readOnly={readOnly}>
			<Select
				items={LINK_CHOICES}
				value={choice}
				disabled={readOnly}
				onValueChange={(next) => {
					if (next !== null) choose(next);
				}}
			>
				<SelectTrigger aria-label={`${label} opens`} className="w-full">
					<SelectValue>{words}</SelectValue>
				</SelectTrigger>
				<SelectContent>
					<SelectGroup>
						{LINK_CHOICES.map((item) => (
							<SelectItem
								key={item.value}
								value={item.value}
								disabled={unavailable(item.value)}
							>
								{item.label}
							</SelectItem>
						))}
					</SelectGroup>
				</SelectContent>
			</Select>
			{target.kind === "service" && (
				<ServicePicker
					serviceId={target.serviceId}
					onChange={onChange}
					readOnly={readOnly}
				/>
			)}
			{choice === "page" && (
				<PagePicker
					pageId={linkedPage(target, pages)?.id ?? null}
					onChange={onChange}
					readOnly={readOnly}
				/>
			)}
			{choice === "web" && (
				<WebAddressInput
					key={blockId}
					href={href}
					onChange={onChange}
					readOnly={readOnly}
				/>
			)}
			{noServices && (
				<p className="text-muted-foreground text-xs">
					To open booking for one service, add services first.
				</p>
			)}
			{noPages && (
				<p className="text-muted-foreground text-xs">
					To open another page, publish one first.
				</p>
			)}
		</EditorField>
	);
}

export const linkField: CustomFieldUi = {
	type: "custom",
	render: ({ field, name, value, onChange, readOnly }) => (
		<LinkPicker
			label={field.label ?? name}
			href={typeof value === "string" ? value : ""}
			onChange={onChange}
			readOnly={readOnly}
		/>
	),
};
