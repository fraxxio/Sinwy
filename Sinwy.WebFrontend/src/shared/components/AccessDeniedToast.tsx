import { useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { toast } from "#/shared/components/ui/toast";
import { takeAccessDenied } from "#/shared/lib/auth/access-denied";

const TOAST_ID = "permission-denied";

/** Render after the Toaster so its provider is subscribed before this effect runs. */
export default function AccessDeniedToast() {
	const status = useRouterState({ select: (s) => s.status });

	useEffect(() => {
		if (status !== "idle") return;
		const title = takeAccessDenied();
		if (!title) return;
		toast.add({ id: TOAST_ID, type: "error", title, timeout: 5_000 });
	}, [status]);

	return null;
}
