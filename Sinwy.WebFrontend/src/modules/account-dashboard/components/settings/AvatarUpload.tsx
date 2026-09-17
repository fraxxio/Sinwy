import { AVATAR_LIMITS, type AvatarDto } from "@sinwy/shared";
import { useRef, useState } from "react";
import {
	refreshSession,
	type SessionUser,
} from "#/modules/account-dashboard/lib/account-queries";
import { initials } from "#/shared/components/shell/display-name";
import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "#/shared/components/ui/avatar";
import { Button } from "#/shared/components/ui/button";
import { FieldDescription, FieldError } from "#/shared/components/ui/field";
import { api, apiUpload } from "#/shared/lib/api";

const allowedTypes: readonly string[] = AVATAR_LIMITS.mimeTypes;

const clientCheck = (file: File) => {
	if (!allowedTypes.includes(file.type))
		return "Only PNG, JPEG and WebP images are allowed";
	if (file.size > AVATAR_LIMITS.maxBytes)
		return "Image must be 2 MB or smaller";
	return null;
};

export function AvatarUpload({ user }: { user: SessionUser }) {
	const inputRef = useRef<HTMLInputElement>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const upload = async (file: File) => {
		const rejected = clientCheck(file);
		setError(rejected);
		if (rejected) return;

		setBusy(true);
		const form = new FormData();
		form.append("file", file);
		const res = await apiUpload<AvatarDto>("/user/avatar", form);
		setBusy(false);
		if (!res.isSuccess) {
			setError(res.message);
			return;
		}
		refreshSession();
	};

	const remove = async () => {
		setError(null);
		setBusy(true);
		const res = await api("/user/avatar", { method: "DELETE" });
		setBusy(false);
		if (!res.isSuccess) {
			setError(res.message);
			return;
		}
		refreshSession();
	};

	return (
		<div className="flex flex-col items-center gap-3">
			<Avatar className="size-24">
				<AvatarImage src={user.image ?? undefined} alt={user.name} />
				<AvatarFallback className="text-2xl">
					{initials(user.name || user.email)}
				</AvatarFallback>
			</Avatar>
			<input
				ref={inputRef}
				type="file"
				accept={AVATAR_LIMITS.mimeTypes.join(",")}
				className="hidden"
				onChange={(e) => {
					const file = e.target.files?.[0];
					e.target.value = "";
					if (file) void upload(file);
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
					{user.image ? "Change" : "Upload"}
				</Button>
				{user.image && (
					<Button
						type="button"
						variant="ghost"
						size="sm"
						disabled={busy}
						onClick={() => void remove()}
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
