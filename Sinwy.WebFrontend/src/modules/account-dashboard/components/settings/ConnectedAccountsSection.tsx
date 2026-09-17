import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { SettingsSection } from "#/modules/account-dashboard/components/settings/SettingsSection";
import {
	accountKeys,
	accountsQuery,
	hasCredentialAccount,
} from "#/modules/account-dashboard/lib/account-queries";
import { Icon } from "#/shared/components/icons";
import { Badge } from "#/shared/components/ui/badge";
import { Button } from "#/shared/components/ui/button";
import { FieldError } from "#/shared/components/ui/field";
import { Skeleton } from "#/shared/components/ui/skeleton";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "#/shared/components/ui/tooltip";
import { authClient } from "#/shared/lib/auth/auth-client";

export function ConnectedAccountsSection() {
	const queryClient = useQueryClient();
	const { data: accounts, isPending, isError } = useQuery(accountsQuery);
	const [error, setError] = useState<string | null>(null);

	const google = accounts?.find((account) => account.providerId === "google");
	const canUnlink = !!accounts && hasCredentialAccount(accounts);

	const link = useMutation({
		mutationFn: async () => {
			const { error } = await authClient.linkSocial({
				provider: "google",
				callbackURL: "/account/settings",
			});
			if (error) throw new Error(error.message ?? "Couldn't connect Google");
		},
		onMutate: () => setError(null),
		onError: (e) => setError(e.message),
	});

	const unlink = useMutation({
		mutationFn: async () => {
			const { error } = await authClient.unlinkAccount({
				providerId: "google",
			});
			if (error) throw new Error(error.message ?? "Couldn't disconnect Google");
		},
		onMutate: () => setError(null),
		onError: (e) => setError(e.message),
		onSettled: () =>
			queryClient.invalidateQueries({ queryKey: accountKeys.accounts }),
	});

	return (
		<SettingsSection
			id="connected-accounts"
			title="Connected accounts"
			description="Other ways to sign in to this account."
		>
			{isPending ? (
				<Skeleton className="h-12" />
			) : isError ? (
				<FieldError>
					Couldn't load connected accounts. Reload to retry.
				</FieldError>
			) : (
				<div className="flex items-center justify-between gap-4">
					<div className="flex items-center gap-3 text-sm">
						<Icon name="google" className="size-5" />
						<span className="font-medium">Google</span>
						{google ? (
							<Badge variant="secondary">Connected</Badge>
						) : (
							<Badge variant="outline">Not connected</Badge>
						)}
					</div>
					{google ? (
						<TooltipProvider>
							<Tooltip>
								<TooltipTrigger render={<span className="inline-flex" />}>
									<Button
										type="button"
										variant="outline"
										size="sm"
										disabled={!canUnlink || unlink.isPending}
										onClick={() => unlink.mutate()}
									>
										{unlink.isPending ? "Disconnecting…" : "Disconnect"}
									</Button>
								</TooltipTrigger>
								{!canUnlink && (
									<TooltipContent>Set a password first</TooltipContent>
								)}
							</Tooltip>
						</TooltipProvider>
					) : (
						<Button
							type="button"
							variant="outline"
							size="sm"
							disabled={link.isPending}
							onClick={() => link.mutate()}
						>
							{link.isPending ? "Redirecting…" : "Connect"}
						</Button>
					)}
				</div>
			)}
			{error && <FieldError className="mt-3">{error}</FieldError>}
		</SettingsSection>
	);
}
