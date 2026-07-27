import { useState } from "react";
import { authClient } from "#/modules/auth/lib/auth-client";
import { Icon } from "#/shared/components/icons";
import { FieldError } from "#/shared/components/ui/field";

export const GoogleSignInButton = ({
	callbackURL,
}: {
	callbackURL: string;
}) => {
	const [serverError, setServerError] = useState<string | null>(null);

	return (
		<>
			<button
				type="button"
				className="flex h-10 w-full font-bold cursor-pointer items-center justify-center gap-2.5 rounded-full border border-[#9c9e9d4a] bg-white px-3 font-[Roboto,Arial,sans-serif] text-sm text-[#1F1F1F] transition-colors hover:bg-[#F2F2F2] disabled:opacity-50"
				onClick={async () => {
					setServerError(null);
					const { error } = await authClient.signIn.social({
						provider: "google",
						callbackURL,
					});
					if (error) setServerError(error.message ?? "Google sign-in failed");
				}}
			>
				<Icon name="google" className="size-5 shrink-0" />
				Sign in with Google
			</button>
			{serverError && <FieldError className="mt-2">{serverError}</FieldError>}
		</>
	);
};
