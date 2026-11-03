import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/$organizationSlug/")({
	beforeLoad: ({ params }) => {
		throw redirect({
			to: "/$organizationSlug/book",
			params,
			replace: true,
		});
	},
});
