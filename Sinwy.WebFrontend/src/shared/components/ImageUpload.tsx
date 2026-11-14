import { type ApiResponse, IMAGE_UPLOAD_LIMITS } from "@sinwy/shared";
import { type ReactNode, useRef, useState } from "react";
import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "#/shared/components/ui/avatar";
import { Button } from "#/shared/components/ui/button";
import { FieldDescription, FieldError } from "#/shared/components/ui/field";
import { api, apiUpload } from "#/shared/lib/api";
import { cn } from "#/shared/lib/utils";

const allowedTypes: readonly string[] = IMAGE_UPLOAD_LIMITS.mimeTypes;

const clientCheck = (file: File) => {
	if (!allowedTypes.includes(file.type))
		return "Only PNG, JPEG and WebP images are allowed";
	if (file.size > IMAGE_UPLOAD_LIMITS.maxBytes)
		return "Image must be 2 MB or smaller";
	return null;
};

/** Uploads with POST and removes with DELETE on `path`; `onChange` runs after either succeeds. */
export function ImageUpload({
	path,
	image,
	alt,
	fallback,
	className,
	onChange,
}: {
	path: string;
	image: string | null;
	alt: string;
	fallback: ReactNode;
	className?: string;
	onChange: () => void | Promise<void>;
}) {
	const inputRef = useRef<HTMLInputElement>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const run = async (request: () => Promise<ApiResponse<unknown>>) => {
		setBusy(true);
		const res = await request();
		if (res.isSuccess) await onChange();
		else setError(res.message);
		setBusy(false);
	};

	const upload = (file: File) => {
		const rejected = clientCheck(file);
		setError(rejected);
		if (rejected) return;
		const form = new FormData();
		form.append("file", file);
		void run(() => apiUpload(path, form));
	};

	const remove = () => {
		setError(null);
		void run(() => api(path, { method: "DELETE" }));
	};

	return (
		<div className="flex flex-col items-center gap-3">
			<Avatar className={cn("size-24", className)}>
				<AvatarImage src={image ?? undefined} alt={alt} />
				<AvatarFallback className="text-2xl">{fallback}</AvatarFallback>
			</Avatar>
			<input
				ref={inputRef}
				type="file"
				accept={IMAGE_UPLOAD_LIMITS.mimeTypes.join(",")}
				className="hidden"
				onChange={(e) => {
					const file = e.target.files?.[0];
					e.target.value = "";
					if (file) upload(file);
				}}
			/>
			<div className="flex gap-2">
				<Button
					type="button"
					variant="outline"
					size="sm"
					disabled={busy}
					onClick={() => inputRef.current?.click()}
				>
					{image ? "Change" : "Upload"}
				</Button>
				{image && (
					<Button
						type="button"
						variant="ghost"
						size="sm"
						disabled={busy}
						onClick={remove}
					>
						Remove
					</Button>
				)}
			</div>
			{error ? (
				<FieldError className="text-center text-xs">{error}</FieldError>
			) : (
				<FieldDescription className="text-center text-xs">
					PNG, JPEG or WebP, up to 2 MB.
				</FieldDescription>
			)}
		</div>
	);
}
