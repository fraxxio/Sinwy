import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import ExpiredPasswordLink from "#/modules/auth/components/ExpiredPasswordLink";
import ResetPasswordForm from "#/modules/auth/components/ResetPasswordForm";

export const Route = createFileRoute("/auth/reset-password")({
	validateSearch: z.object({
		token: z.string().optional(),
		error: z.string().optional(),
	}),
	component: ResetPasswordPage,
});

function ResetPasswordPage() {
	const { token, error } = Route.useSearch();

	if (!token || error) return <ExpiredPasswordLink />;

	return <ResetPasswordForm token={token} />;
}
