import { expect, it } from "bun:test";
import type { PostLoginFlags } from "@sinwy/shared";
import { resumePrompt, shouldPromptResume } from "../lib/resume-prompt";

const unfinished: PostLoginFlags = {
	unfinishedOnboarding: { step: "select-plan", organizationId: "abc123" },
};

it("returns nothing when there is no unfinished onboarding", () => {
	expect(shouldPromptResume({ unfinishedOnboarding: null }, "/")).toBeNull();
});

it("returns nothing when the flags could not be fetched", () => {
	expect(shouldPromptResume(null, "/")).toBeNull();
});

it("prompts outside the funnel", () => {
	expect(shouldPromptResume(unfinished, "/")).toEqual({
		step: "select-plan",
		organizationId: "abc123",
	});
	expect(shouldPromptResume(unfinished, "/about")).not.toBeNull();
});

it.each([
	"/organizations/$id/plan",
	"/organizations/$id/onboarding",
	"/organizations/new",
	"/checkout/success",
	"/auth/login",
	"/auth/register",
	"/auth/forgot-password",
	"/auth/reset-password",
	"/auth/postlogin",
])("stays quiet inside the funnel: %s", (routeId) => {
	expect(shouldPromptResume(unfinished, routeId)).toBeNull();
});

it("covers auth routes that do not exist yet", () => {
	expect(shouldPromptResume(unfinished, "/auth/verify-email")).toBeNull();
	expect(shouldPromptResume(unfinished, "/auth")).toBeNull();
});

it("matches whole segments, not bare string prefixes", () => {
	expect(shouldPromptResume(unfinished, "/author")).not.toBeNull();
	expect(
		shouldPromptResume(unfinished, "/organizations/newsletter"),
	).not.toBeNull();
});

it("sends select-plan back to the plan page", () => {
	expect(
		resumePrompt({ step: "select-plan", organizationId: "abc123" }),
	).toMatchObject({
		to: "/organizations/$id/plan",
		params: { id: "abc123" },
	});
});
