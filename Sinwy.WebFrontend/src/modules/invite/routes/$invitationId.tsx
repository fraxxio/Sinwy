import { type InvitationPreviewDto, ORG_ROLE_LABELS } from "@sinwy/shared";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
	acceptInvite,
	invitationPreviewQuery,
	inviteView,
} from "#/modules/invite/lib/invite";
import { Button } from "#/shared/components/ui/button";
import { FieldError } from "#/shared/components/ui/field";
import { authClient } from "#/shared/lib/auth/auth-client";
import { authErrorMessage } from "#/shared/lib/auth/auth-error";
import { memberAccessQuery } from "#/shared/lib/auth/permissions";
import { useSignOut } from "#/shared/lib/auth/sign-out";
import { invalidateOrganizations } from "#/shared/lib/organizations";

export const Route = createFileRoute("/invite/$invitationId")({
	ssr: false,
	beforeLoad: async () => {
		const { data } = await authClient.getSession();
		return { sessionEmail: data?.user.email };
	},
	loader: ({ context, params }) =>
		context.queryClient.fetchQuery({
			...invitationPreviewQuery(params.invitationId),
			staleTime: 0,
		}),
	head: () => ({ meta: [{ title: "Invitation · Sinwy" }] }),
	component: InvitePage,
});

function InvitePage() {
	const preview = Route.useLoaderData();
	const { sessionEmail } = Route.useRouteContext();
	const view = inviteView(preview, sessionEmail);

	if (view === "unavailable" || view === "expired" || !preview)
		return (
			<InviteLayout title="This invite is no longer valid">
				<p className="text-sm text-muted-foreground">
					{view === "expired"
						? `It expired. Ask ${preview?.inviterName ?? "whoever invited you"} to send a new one.`
						: "It may have been revoked or already answered. Ask whoever invited you to send a new one."}
				</p>
				<Button nativeButton={false} render={<Link to="/" />}>
					Go to the homepage
				</Button>
			</InviteLayout>
		);

	return (
		<InviteLayout title={`Join ${preview.organization.name}`}>
			<p className="text-sm text-muted-foreground">
				{preview.inviterName} invited {preview.email} to join{" "}
				<span className="font-medium text-foreground">
					{preview.organization.name}
				</span>{" "}
				as {ORG_ROLE_LABELS[preview.role]}.
			</p>
			{view === "signed-out" && <SignedOut />}
			{view === "mismatch" && (
				<Mismatch preview={preview} sessionEmail={sessionEmail ?? ""} />
			)}
			{view === "ready" && (
				<Answer preview={preview} sessionEmail={sessionEmail ?? ""} />
			)}
		</InviteLayout>
	);
}

function InviteLayout({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<main className="page-wrap flex justify-center py-16">
			<div className="grid w-full max-w-sm gap-6">
				<h1 className="text-2xl font-bold tracking-tight">{title}</h1>
				{children}
			</div>
		</main>
	);
}

function SignedOut() {
	const { invitationId } = Route.useParams();
	const search = { redirect: `/invite/${invitationId}` };
	return (
		<div className="grid gap-2">
			<p className="text-sm text-muted-foreground">
				Sign in or create an account with this email to accept.
			</p>
			<Button
				nativeButton={false}
				render={<Link to="/auth/login" search={search} />}
			>
				Sign in
			</Button>
			<Button
				variant="outline"
				nativeButton={false}
				render={<Link to="/auth/register" search={search} />}
			>
				Create account
			</Button>
		</div>
	);
}

function Mismatch({
	preview,
	sessionEmail,
}: {
	preview: InvitationPreviewDto;
	sessionEmail: string;
}) {
	const signOut = useSignOut({ stay: true });
	return (
		<div className="grid gap-2">
			<p className="text-sm text-muted-foreground">
				This invite is for {preview.email}, but you're signed in as{" "}
				{sessionEmail}. Sign out, then sign in with the invited email.
			</p>
			<Button onClick={signOut}>Sign out</Button>
		</div>
	);
}

function Answer({
	preview,
	sessionEmail,
}: {
	preview: InvitationPreviewDto;
	sessionEmail: string;
}) {
	const { invitationId } = Route.useParams();
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const [pending, setPending] = useState<"accept" | "decline" | null>(null);
	const [error, setError] = useState<string | null>(null);

	const accept = async () => {
		setPending("accept");
		setError(null);
		const outcome = await acceptInvite(
			invitationId,
			preview,
			sessionEmail,
			authClient.organization.acceptInvitation,
		);
		if (!outcome.ok) {
			setError(outcome.message);
			setPending(null);
			return;
		}
		await Promise.all([
			invalidateOrganizations(queryClient),
			queryClient.invalidateQueries({
				queryKey: memberAccessQuery(outcome.organizationId).queryKey,
			}),
		]);
		await navigate({
			to: "/dashboard/$organizationSlug",
			params: { organizationSlug: preview.organization.slug },
		});
	};

	const decline = async () => {
		setPending("decline");
		setError(null);
		const { error } = await authClient.organization.rejectInvitation({
			invitationId,
		});
		if (error) {
			setError(authErrorMessage(error));
			setPending(null);
			return;
		}
		await navigate({ to: "/auth/postlogin" });
	};

	return (
		<div className="grid gap-2">
			{error && <FieldError>{error}</FieldError>}
			<Button onClick={accept} disabled={pending !== null}>
				{pending === "accept" ? "Joining…" : "Accept invite"}
			</Button>
			<Button variant="outline" onClick={decline} disabled={pending !== null}>
				{pending === "decline" ? "Declining…" : "Decline"}
			</Button>
		</div>
	);
}
