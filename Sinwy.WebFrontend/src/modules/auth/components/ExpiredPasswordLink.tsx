import { Link } from "@tanstack/react-router";
import { AuthLayout } from "#/modules/auth/components/AuthLayout";
import { Button } from "#/shared/components/ui/button";

const ExpiredPasswordLink = () => {
	return (
		<AuthLayout>
			<div className="space-y-1.5 text-center">
				<h1 className="text-2xl font-bold tracking-tight">Link expired</h1>
				<p className="text-sm text-muted-foreground">
					This reset link is no longer valid. Request a new one to continue.
				</p>
			</div>
			<Button
				className="mt-6 w-full"
				render={<Link to="/auth/forgot-password" />}
			>
				Request a new link
			</Button>
		</AuthLayout>
	);
};

export default ExpiredPasswordLink;
