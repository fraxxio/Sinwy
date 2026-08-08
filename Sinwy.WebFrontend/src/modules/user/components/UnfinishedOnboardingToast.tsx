import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import {
	resumePrompt,
	shouldPromptResume,
} from "#/modules/user/lib/resume-prompt";
import { usePostLoginFlags } from "#/modules/user/lib/usePostLoginFlags";
import { toast } from "#/shared/components/ui/toast";

const TOAST_ID = "unfinished-onboarding";

// Raised at most once per app load, so dismissing it sticks for the session.
let raised = false;

export default function UnfinishedOnboardingToast() {
	const navigate = useNavigate();
	const routeId = useRouterState({
		select: (s) => s.matches.at(-1)?.routeId ?? "",
	});
	const { data: flags } = usePostLoginFlags();

	useEffect(() => {
		if (raised) return;

		const unfinished = shouldPromptResume(flags ?? null, routeId);
		if (!unfinished) return;

		raised = true;
		const prompt = resumePrompt(unfinished);
		toast.add({
			id: TOAST_ID,
			type: "info",
			title: prompt.title,
			description: prompt.description,
			timeout: 10_000,
			data: { hideClose: true, dismissLabel: "Not now" },
			actionProps: {
				children: prompt.action,
				onClick: () => {
					toast.close(TOAST_ID);
					void navigate({ to: prompt.to, params: prompt.params });
				},
			},
		});
	}, [flags, routeId, navigate]);

	return null;
}
