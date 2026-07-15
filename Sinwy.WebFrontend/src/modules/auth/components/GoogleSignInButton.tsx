import { useState } from "react";
import { authClient } from "#/modules/auth/lib/auth-client";
import { Button } from "#/shared/components/ui/button";
import { FieldError } from "#/shared/components/ui/field";

export const GoogleSignInButton = ({
	callbackURL,
}: {
	callbackURL: string;
}) => {
	const [serverError, setServerError] = useState<string | null>(null);

	return (
		<>
			<Button
				type="button"
				variant="outline"
				className="mt-3 w-full"
				onClick={async () => {
					setServerError(null);
					const { error } = await authClient.signIn.social({
						provider: "google",
						callbackURL,
					});
					if (error) setServerError(error.message ?? "Google sign-in failed");
				}}
			>
				Continue with Google
			</Button>
			{serverError && <FieldError className="mt-2">{serverError}</FieldError>}
		</>
	);
};
