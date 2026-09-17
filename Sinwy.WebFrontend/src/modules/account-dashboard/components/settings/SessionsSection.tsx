import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { SettingsSection } from "#/modules/account-dashboard/components/settings/SettingsSection";
import {
	accountKeys,
	sessionsQuery,
} from "#/modules/account-dashboard/lib/account-queries";
import { describeUserAgent } from "#/modules/account-dashboard/lib/describe-user-agent";
import { Badge } from "#/shared/components/ui/badge";
import { Button } from "#/shared/components/ui/button";
import { FieldError } from "#/shared/components/ui/field";
import { Skeleton } from "#/shared/components/ui/skeleton";
import { authClient } from "#/shared/lib/auth/auth-client";

const when = new Intl.DateTimeFormat(undefined, {
	dateStyle: "medium",
	timeStyle: "short",
});

const format = (value: Date | string) => when.format(new Date(value));

export function SessionsSection({ currentToken }: { currentToken: string }) {
	const queryClient = useQueryClient();
	const { data: sessions, isPending, isError } = useQuery(sessionsQuery);
	const [error, setError] = useState<string | null>(null);

	const refresh = () =>
		queryClient.invalidateQueries({ queryKey: accountKeys.sessions });

	const revokeOne = useMutation({
		mutationFn: async (token: string) => {
			const { error } = await authClient.revokeSession({ token });
			if (error) throw new Error(error.message ?? "Couldn't revoke session");
		},
		onMutate: () => setError(null),
		onError: (e) => setError(e.message),
		onSettled: refresh,
	});

	const revokeOthers = useMutation({
		mutationFn: async () => {
			const { error } = await authClient.revokeOtherSessions();
			if (error) throw new Error(error.message ?? "Couldn't sign out devices");
		},
		onMutate: () => setError(null),
		onError: (e) => setError(e.message),
		onSettled: refresh,
	});

	const others = sessions?.filter((s) => s.token !== currentToken) ?? [];

	return (
		<SettingsSection
			id="sessions"
			title="Sessions"
			description="Devices currently signed in to your account."
			action={
				<Button
					type="button"
					variant="outline"
					size="sm"
					disabled={others.length === 0 || revokeOthers.isPending}
					onClick={() => revokeOthers.mutate()}
				>
					{revokeOthers.isPending ? "Signing out…" : "Sign out other devices"}
				</Button>
			}
		>
			{isPending ? (
				<Skeleton className="h-24" />
			) : isError ? (
				<FieldError>Couldn't load your sessions. Reload to retry.</FieldError>
			) : (
				<ul className="divide-y">
					{sessions.map((session) => {
						const current = session.token === currentToken;
						return (
							<li
								key={session.id}
								className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
							>
								<div className="grid gap-0.5 text-sm">
									<div className="flex flex-wrap items-center gap-2">
										<span className="font-medium">
											{describeUserAgent(session.userAgent)}
										</span>
										{current && <Badge variant="secondary">Current</Badge>}
									</div>
									<span className="text-xs text-muted-foreground">
										{session.ipAddress || "Unknown IP"} · signed in{" "}
										{format(session.createdAt)}
									</span>
								</div>
								{!current && (
									<Button
										type="button"
										variant="ghost"
										size="sm"
										disabled={revokeOne.isPending}
										onClick={() => revokeOne.mutate(session.token)}
									>
										Revoke
									</Button>
								)}
							</li>
						);
					})}
				</ul>
			)}
			{error && <FieldError className="mt-3">{error}</FieldError>}
		</SettingsSection>
	);
}
