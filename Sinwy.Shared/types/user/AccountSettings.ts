import { z } from "zod";
import { passwordSchema } from "../auth/Password";
import type { OrganizationStatus } from "../organization/Organization";

export const PROFILE_LIMITS = { name: 100 } as const;

// One name rule for sign-up and profile edits, so a user can always save what they registered with.
// Words are letters with optional apostrophes and a trailing period (O'Brien, J. Smith), joined by spaces or hyphens.
export const userNameSchema = z
	.string()
	.trim()
	.min(2, "Name must be at least 2 characters")
	.max(PROFILE_LIMITS.name, `Max ${PROFILE_LIMITS.name} characters`)
	.regex(
		/^\p{L}[\p{L}'’]*\.?(?:[ -]\p{L}[\p{L}'’]*\.?)*$/u,
		"Use letters, spaces, hyphens, apostrophes and periods only",
	);

export const profileSchema = z.object({
	name: userNameSchema,
});
export type ProfileInput = z.infer<typeof profileSchema>;

export type AvatarDto = { image: string };

export type AccountDeletionPreviewDto = {
	soleOwnedOrganizations: {
		id: string;
		name: string;
		status: OrganizationStatus;
		/** Pending and confirmed bookings that haven't started; deleting the account cancels them. */
		upcomingBookings: number;
	}[];
	/** The user's own pending and confirmed bookings that haven't started; deleting the account cancels them. */
	upcomingBookings: number;
};

export const setPasswordSchema = z.object({ newPassword: passwordSchema });
export type SetPasswordInput = z.infer<typeof setPasswordSchema>;
