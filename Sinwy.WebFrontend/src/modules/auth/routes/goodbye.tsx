import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { z } from "zod";
import { AuthLayout } from "#/modules/auth/components/AuthLayout";
import { Button } from "#/shared/components/ui/button";

export const Route = createFileRoute("/auth/goodbye")({
	validateSearch: z.object({ error: z.string().optional() }),
	component: GoodbyePage,
});

const humanize = (code: string) => code.replaceAll("_", " ");

function GoodbyePage() {
	const { error } = Route.useSearch();
	const queryClient = useQueryClient();

	// the session is gone server-side; nothing cached belongs to anyone now
	useEffect(() => {
		queryClient.clear();
	}, [queryClient]);

	if (error) {
		return (
			<AuthLayout>
				<div className="space-y-1.5 text-center">
					<h1 className="text-2xl font-bold tracking-tight">
						We couldn't delete your account
					</h1>
					<p className="text-sm text-muted-foreground">
						{humanize(error)}. Nothing was removed; you can try again from your
						settings.
					</p>
				</div>
				<Button
					className="mt-6 w-full"
					render={<Link to="/account/settings" />}
				>
					Back to settings
				</Button>
			</AuthLayout>
		);
	}

	return (
		<AuthLayout>
			<div className="space-y-1.5 text-center">
				<h1 className="text-2xl font-bold tracking-tight">
					Your account has been deleted
				</h1>
				<p className="text-sm text-muted-foreground">
					Thanks for using Sinwy. You're welcome back any time.
				</p>
			</div>
			<Button className="mt-6 w-full" render={<Link to="/" />}>
				Go to the homepage
			</Button>
		</AuthLayout>
	);
}
