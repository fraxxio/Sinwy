import { API_ERROR_CODES, type SubscriptionBillingDto } from "@sinwy/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import {
	billingKeys,
	fetchSubscription,
	invalidateSubscription,
	openPolarPortal,
	runSubscriptionAction,
} from "#/modules/account-dashboard/lib/billing-queries";
import { formatPrice } from "#/modules/account-dashboard/lib/subscription-status";
import { Button } from "#/shared/components/ui/button";
import {
	Card,
	CardContent,
	CardFooter,
	CardHeader,
	CardTitle,
} from "#/shared/components/ui/card";
import { FieldError } from "#/shared/components/ui/field";
import { toast } from "#/shared/components/ui/toast";
import { invalidateOrganizations } from "#/shared/lib/organizations";
import { pollUntil } from "#/shared/lib/poll-until";

class ResumeError extends Error {
	constructor(
		message: string,
		readonly code: number,
	) {
		super(message);
	}
}

// the plan's state moved on, so a fresh read knows better
const STALE_CODES: readonly number[] = [
	API_ERROR_CODES.PLAN_NOT_SUSPENDED,
	API_ERROR_CODES.PLAN_REQUIRED,
];

export function ResumePanel({
	billing,
}: {
	/** null when Polar could not be reached. */
	billing: SubscriptionBillingDto | null;
}) {
	const queryClient = useQueryClient();
	const mounted = useRef(true);
	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
		};
	}, []);

	const resume = useMutation({
		mutationFn: async () => {
			const res = await runSubscriptionAction("resume");
			if (!res.isSuccess) throw new ResumeError(res.message, res.code);
			const resumed =
				res.data.plan !== null
					? res.data
					: await pollUntil(
							fetchSubscription,
							(subscription) => subscription.plan !== null,
							{ isCancelled: () => !mounted.current },
						);
			return { resumed, message: res.message };
		},
		onSuccess: async ({ resumed, message }) => {
			if (!resumed) return;
			queryClient.setQueryData(billingKeys.subscription, resumed);
			await invalidateOrganizations(queryClient);
			toast.add(
				resumed.billing?.subscriptionStatus === "past_due"
					? {
							type: "warning",
							title: "Resumed, but the payment failed",
							description:
								message ??
								"Update your payment method on Polar to keep your plan.",
						}
					: { type: "success", title: "Welcome back", timeout: 4_000 },
			);
		},
		onError: (error) => {
			if (error instanceof ResumeError && STALE_CODES.includes(error.code))
				void invalidateSubscription(queryClient);
		},
	});

	const openPortal = useMutation({ mutationFn: openPolarPortal });
	const paymentFailed =
		resume.error instanceof ResumeError &&
		resume.error.code === API_ERROR_CODES.RESUME_PAYMENT_FAILED;
	const timedOut = resume.isSuccess && !resume.data.resumed;
	const busy = resume.isPending || resume.isSuccess;
	const price = billing && formatPrice(billing);

	return (
		<Card>
			<CardHeader>
				<CardTitle>Resume your plan</CardTitle>
				{price && <p className="font-medium text-2xl">{price}</p>}
			</CardHeader>
			<CardContent className="space-y-2 text-muted-foreground text-sm">
				<p>
					Your plan is suspended, so every organization you own is offline.
					Resuming starts a new billing period today and brings them back. Polar
					charges your saved payment method right away; there's no new checkout.
				</p>
				{!billing && (
					<p>
						We couldn't load the price right now. It's the plan you had when you
						suspended.
					</p>
				)}
			</CardContent>
			<CardFooter className="flex-col items-stretch gap-3">
				<Button
					size="lg"
					disabled={busy && !timedOut}
					onClick={() =>
						timedOut
							? void invalidateSubscription(queryClient)
							: resume.mutate()
					}
				>
					{timedOut
						? "Check again"
						: resume.isPending
							? "Resuming…"
							: price
								? `Resume for ${price}`
								: "Resume"}
				</Button>
				{timedOut && (
					<p className="text-center text-muted-foreground text-sm">
						Polar accepted it, but it isn't confirmed yet. This usually takes a
						few seconds.
					</p>
				)}
				{resume.isError && (
					<FieldError className="text-center">
						{resume.error.message}
					</FieldError>
				)}
				{paymentFailed && (
					<Button
						variant="outline"
						disabled={openPortal.isPending || openPortal.isSuccess}
						onClick={() => openPortal.mutate()}
					>
						Update payment method on Polar
					</Button>
				)}
			</CardFooter>
		</Card>
	);
}
