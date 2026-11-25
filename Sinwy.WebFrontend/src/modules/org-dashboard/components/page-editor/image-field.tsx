import { type ComponentData, useGetPuck } from "@puckeditor/core";
import {
	type ApiResponse,
	BLOCKS,
	type Blocks,
	type PageImageDto,
} from "@sinwy/shared";
import { ImageIcon, LoaderCircleIcon } from "lucide-react";
import {
	createContext,
	type DragEvent,
	use,
	useEffect,
	useId,
	useRef,
	useState,
} from "react";
import type { CustomFieldUi } from "#/shared/components/page-builder/puck-config";
import { Button } from "#/shared/components/ui/button";
import { Input } from "#/shared/components/ui/input";
import { cn } from "#/shared/lib/utils";
import { EditorField, usePuck } from "./editor-fields";
import { type ImageShape, shapeFor, shrinkImage } from "./images";

export type UploadImage = (
	image: Blob,
	signal?: AbortSignal,
) => Promise<ApiResponse<PageImageDto>>;

export const EditorImageUploadContext = createContext<UploadImage | null>(null);

type UploadView =
	| { blockId: string; status: "preparing" }
	| { blockId: string; status: "uploading"; preview: string }
	| {
			blockId: string;
			status: "failed";
			message: string;
			preview: string | null;
			retry: (() => void) | null;
	  };

const MESSAGES = {
	unreadable:
		"This file can't be read as a photo. Choose a JPEG, PNG or another image.",
	"too-large":
		"This photo is still over 2 MB after shrinking. Choose a smaller photo.",
	network: "The photo didn't upload. Check your connection and try again.",
};

const isUploadedImage = (src: string) => src.includes("/api/files/pages/");

/** Writes the uploaded photo, and the shape that fits it where the block has one, as a single history entry. */
function useWriteImage() {
	const getPuck = useGetPuck();
	return (blockId: string, name: string, src: string, shape: ImageShape) => {
		const { dispatch, getItemBySelector, getSelectorForId } = getPuck();
		const at = getSelectorForId(blockId);
		const item = at && getItemBySelector(at);
		if (!at || !item) return;
		const fields = (BLOCKS as Blocks)[item.type]?.fields ?? {};
		const data: ComponentData = {
			...item,
			props: {
				...item.props,
				[name]: src,
				...("aspect" in fields && { aspect: shape }),
			},
		};
		dispatch({
			type: "replace",
			destinationZone: at.zone,
			destinationIndex: at.index,
			data,
		});
	};
}

function ImageField({
	label,
	name,
	value,
	onChange,
	readOnly,
}: {
	label: string;
	name: string;
	value: string;
	onChange: (value: string) => void;
	readOnly?: boolean | undefined;
}) {
	const upload = use(EditorImageUploadContext);
	const blockId = usePuck(
		(s) => s.selectedItem?.props.id as string | undefined,
	);
	const write = useWriteImage();
	const inputId = useId();
	const fileInput = useRef<HTMLInputElement>(null);
	const latest = useRef(0);
	const [view, setView] = useState<UploadView | null>(null);
	const [addressOpen, setAddressOpen] = useState(
		() => value !== "" && !isUploadedImage(value),
	);
	const [dragging, setDragging] = useState(false);

	const preview = view && "preview" in view ? view.preview : null;
	useEffect(
		() => () => {
			if (preview) URL.revokeObjectURL(preview);
		},
		[preview],
	);

	useEffect(() => {
		if (value)
			setView((current) => (current?.status === "failed" ? null : current));
	}, [value]);

	const shown = view?.blockId === blockId ? view : null;
	const busy = shown?.status === "preparing" || shown?.status === "uploading";

	const pick = async (file: File) => {
		if (!upload || !blockId) return;
		const token = ++latest.current;
		const show = (next: UploadView | null) => {
			if (latest.current === token) setView(next);
		};
		show({ blockId, status: "preparing" });
		const shrunk = await shrinkImage(file);
		if (!shrunk.ok) {
			show({
				blockId,
				status: "failed",
				message: MESSAGES[shrunk.reason],
				preview: null,
				retry: null,
			});
			return;
		}
		const previewUrl = URL.createObjectURL(shrunk.blob);
		const send = async () => {
			show({ blockId, status: "uploading", preview: previewUrl });
			const res = await upload(shrunk.blob);
			if (res.isSuccess) {
				write(
					blockId,
					name,
					res.data.src,
					shapeFor(shrunk.width, shrunk.height),
				);
				show(null);
				return;
			}
			const retryable = res.code === 0 || res.code >= 500;
			show({
				blockId,
				status: "failed",
				message: res.code === 0 ? MESSAGES.network : res.message,
				preview: previewUrl,
				retry: retryable ? () => void send() : null,
			});
		};
		await send();
	};

	const onDrop = (event: DragEvent) => {
		event.preventDefault();
		setDragging(false);
		const file = event.dataTransfer.files[0];
		if (file && !readOnly && !busy) void pick(file);
	};

	const image = (shown && "preview" in shown && shown.preview) || value;

	return (
		<EditorField label={label} readOnly={readOnly}>
			<section
				aria-label={`${label} preview`}
				className={cn(
					"relative grid min-h-28 place-items-center overflow-hidden rounded-lg border border-(--line-soft) bg-muted/60",
					!image && "border-2 border-dashed",
					dragging && "border-primary bg-primary/5",
				)}
				onDragOver={(event) => {
					event.preventDefault();
					setDragging(true);
				}}
				onDragLeave={() => setDragging(false)}
				onDrop={onDrop}
			>
				{image ? (
					<img
						src={image}
						alt=""
						className={cn(
							"max-h-48 w-full object-contain",
							busy && "opacity-60",
						)}
					/>
				) : (
					!busy && (
						<div className="grid justify-items-center gap-1 p-4 text-center text-muted-foreground text-xs">
							<ImageIcon className="size-5" />
							Drop a photo here
						</div>
					)
				)}
				{busy && (
					<div className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-background/85 px-2 py-1 text-xs">
						<LoaderCircleIcon className="size-3.5 animate-spin" />
						{shown?.status === "preparing" ? "Preparing photo…" : "Uploading…"}
					</div>
				)}
			</section>
			<input
				ref={fileInput}
				type="file"
				accept="image/*"
				aria-label={`Upload ${label.toLowerCase()}`}
				className="hidden"
				onChange={(event) => {
					const file = event.currentTarget.files?.[0];
					event.currentTarget.value = "";
					if (file) void pick(file);
				}}
			/>
			{shown?.status === "failed" && (
				<div role="alert" className="grid gap-1.5 text-destructive text-xs">
					{shown.message}
					{shown.retry && (
						<Button
							type="button"
							variant="outline"
							size="xs"
							className="justify-self-start"
							onClick={shown.retry}
						>
							Retry
						</Button>
					)}
				</div>
			)}
			{!readOnly && (
				<div className="flex flex-wrap gap-2">
					<Button
						type="button"
						variant="outline"
						size="sm"
						disabled={busy || !upload}
						onClick={() => fileInput.current?.click()}
					>
						{value ? "Change photo" : "Upload photo"}
					</Button>
					{value && (
						<Button
							type="button"
							variant="ghost"
							size="sm"
							disabled={busy}
							onClick={() => onChange("")}
						>
							Remove
						</Button>
					)}
				</div>
			)}
			{addressOpen ? (
				<div className="grid gap-1.5">
					<label htmlFor={inputId} className="text-muted-foreground text-xs">
						Web address of the photo
					</label>
					<Input
						id={inputId}
						value={value}
						placeholder="https://"
						readOnly={readOnly}
						onChange={(event) => onChange(event.currentTarget.value)}
					/>
				</div>
			) : (
				!readOnly && (
					<Button
						type="button"
						variant="link"
						size="xs"
						className="justify-self-start px-0 text-muted-foreground"
						onClick={() => setAddressOpen(true)}
					>
						Use a web address instead
					</Button>
				)
			)}
		</EditorField>
	);
}

export const imageField: CustomFieldUi = {
	type: "custom",
	render: ({ field, name, value, onChange, readOnly }) => (
		<ImageField
			label={field.label ?? name}
			name={name}
			value={typeof value === "string" ? value : ""}
			onChange={onChange}
			readOnly={readOnly}
		/>
	),
};
