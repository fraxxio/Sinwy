import { fail } from "@backend/lib/app/respond";
import type { Middleware } from "@backend/lib/app/types";
import { API_ERROR_CODES, type Feature, hasFeature } from "@sinwy/shared";
import { membershipFrom, requireMember } from "./requirePermission";

/**
 * `requireMember` plus a plan check: the owner's plan lacks the feature →
 * 402. Reads the projected plan only; never asks Polar. An inactive
 * organization has no plan, so it fails here too.
 */
export const requireFeature =
	(feature: Feature): Middleware =>
	(ctx, next) =>
		requireMember(ctx, () =>
			hasFeature(membershipFrom(ctx).plan, feature)
				? next()
				: Promise.resolve(
						fail(
							"Your plan doesn't include this feature",
							402,
							API_ERROR_CODES.PLAN_UPGRADE_REQUIRED,
						),
					),
		);
