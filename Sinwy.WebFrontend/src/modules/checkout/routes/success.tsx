import type { OrganizationStatus } from "@sinwy/shared";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { protectedRoute } from "#/modules/auth/lib/protected-route";
import { pollUntilActive } from "#/modules/checkout/lib/poll-until-active";
import { postLoginFlagsKey } from "#/modules/user/lib/usePostLoginFlags";
import { Button } from "#/shared/components/ui/button";
import { api } from "#/shared/lib/api";

export const Route = createFileRoute("/checkout/success")({
	// expired session → bounce to login (which returns here), not a blind 401 poll
	...protectedRoute,
	validateSearch: z.object({ checkout_id: z.string().optional() }),
	component: CheckoutSuccessPage,
});

type Phase = "activating" | "unknown-org" | "unreachable" | "timed-out";

function CheckoutSuccessPage() {
	const { checkout_id: checkoutId } = Route.useSearch();
	const [attempt, setAttempt] = useState(0);

	return (
		<Activation
			key={attempt}
			checkoutId={checkoutId}
			onRetry={() => setAttempt((n) => n + 1)}
		/>
	);
}

function Activation({
	checkoutId,
	onRetry,
}: {
	checkoutId: string | undefined;
	onRetry: () => void;
}) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [phase, setPhase] = useState<Phase>(
		checkoutId ? "activating" : "unknown-org",
	);

	useEffect(() => {
		if (!checkoutId) return;
		let cancelled = false;

		void (async () => {
			// Polar carries the org id in the checkout metadata — resolve it
			// server-side so the handoff survives a different tab/browser context.
			const res = await api<{ organizationId: string }>(
				`/organizations/checkout/${checkoutId}`,
			);
			if (cancelled) return;
			if (!res.isSuccess) {
				// only a 4xx is the API telling us this checkout is unknown;
				// anything else means we never got an answer
				const answered = res.code >= 400 && res.code < 500;
				setPhase(answered ? "unknown-org" : "unreachable");
				return;
			}
			const orgId = res.data.organizationId;

			const active = await pollUntilActive(
				async () => {
					const status = await api<{ status: OrganizationStatus }>(
						`/organizations/${orgId}/status`,
					);
					return status.isSuccess ? status.data.status : null;
				},
				{ isCancelled: () => cancelled },
			);
			if (cancelled) return;
			if (!active) {
				setPhase("timed-out");
				return;
			}
			await queryClient.invalidateQueries({ queryKey: postLoginFlagsKey });
			void navigate({
				to: "/organizations/$id/onboarding",
				params: { id: orgId },
			});
		})();

		return () => {
			cancelled = true;
		};
	}, [checkoutId, navigate, queryClient]);

	return (
		<main className="page-wrap py-14">
			<div className="mx-auto w-full max-w-sm space-y-3 text-center">
				<h1 className="text-2xl font-bold tracking-tight">Payment received</h1>
				{phase === "unknown-org" ? (
					<>
						<p className="text-sm text-muted-foreground">
							We couldn't tell which organization this payment was for. It will
							activate shortly.
						</p>
						<Link to="/" className="text-sm font-medium text-foreground">
							Back to home
						</Link>
					</>
				) : phase === "unreachable" ? (
					<>
						<p className="text-sm text-muted-foreground">
							Your payment went through but we couldn't reach the server to
							finish setting up your organization.
						</p>
						<Button variant="outline" onClick={onRetry}>
							Try again
						</Button>
					</>
				) : phase === "timed-out" ? (
					<>
						<p className="text-sm text-muted-foreground">
							Activation is taking longer than expected. The webhook may still
							be on its way.
						</p>
						<Button variant="outline" onClick={onRetry}>
							Check again
						</Button>
					</>
				) : (
					<p className="text-sm text-muted-foreground">
						Activating your organization…
					</p>
				)}
			</div>
		</main>
	);
}
