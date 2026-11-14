import { membershipFrom, sessionFrom } from "@authModule";
import { fail, ok } from "@backend/lib/app/respond";
import type { Handler } from "@backend/lib/app/types";
import {
	ImageError,
	readImageUpload,
	respondImageError,
} from "@backend/lib/image";
import {
	createOrganizationBody,
	organizationProfileBody,
} from "@backend/modules/organizations/utils";
import {
	API_ERROR_CODES,
	organizationNameInputSchema,
	organizationTimezoneInputSchema,
} from "@sinwy/shared";
import { listActivity, parseActivityCursor, recordActivity } from "./activity";
import {
	activateOrganization,
	changeOrganizationTimezone,
	completeOrganizationOnboarding,
	createOrganization,
	deactivateOrganization,
	getInvitationPreview,
	getOrganizationGeneral,
	getOrganizationOnboarding,
	listOrganizations,
	removeOrganizationLogo,
	renameOrganization,
	type SlotResult,
	saveOrganizationProfile,
	uploadOrganizationLogo,
} from "./service";

const respondWriteError = (error: "not-found" | "inactive") => {
	switch (error) {
		case "inactive":
			return fail(
				"This organization doesn't have an active plan yet",
				409,
				API_ERROR_CODES.ORGANIZATION_INACTIVE,
			);
		case "not-found":
			return fail("Not found", 404);
	}
};

const respondSlotError = (error: SlotResult) => {
	switch (error) {
		case "not-found":
			return fail("Not found", 404);
		case "no-plan":
			return fail(
				"You need an active plan to activate an organization",
				409,
				API_ERROR_CODES.PLAN_REQUIRED,
			);
		case "limit-reached":
			return fail(
				"Your plan has no free organization slot; deactivate one or upgrade",
				409,
				API_ERROR_CODES.ORGANIZATION_LIMIT_REACHED,
			);
	}
};

export const createOrganizationHandler: Handler = async (c) => {
	const { user } = sessionFrom(c);

	const body = createOrganizationBody.safeParse(
		await c.req.json().catch(() => null),
	);
	if (!body.success) return fail("Invalid body", 400);

	const org = await createOrganization(
		user.id,
		body.data.name,
		body.data.industry,
		body.data.timezone,
	);
	return ok(org, 201, "Organization created");
};

export const listOrganizationsHandler: Handler = async (c) => {
	const { user } = sessionFrom(c);
	return ok(await listOrganizations(user.id));
};

export const getOrganizationOnboardingHandler: Handler = async (c) => {
	const onboarding = await getOrganizationOnboarding(membershipFrom(c));
	return ok(onboarding);
};

export const saveOrganizationProfileHandler: Handler = async (c) => {
	const body = organizationProfileBody.safeParse(
		await c.req.json().catch(() => null),
	);
	// the form validates the same rules, so a rejection here is worth naming
	if (!body.success)
		return fail(body.error.issues[0]?.message ?? "Invalid body", 400);

	const membership = membershipFrom(c);
	const result = await saveOrganizationProfile(membership, body.data);
	if (!result.ok) return respondWriteError(result.error);

	const { profile, changed } = result.data;
	if (changed.length > 0)
		await recordActivity(membership.organizationId, sessionFrom(c).user, {
			action: "organization.profile_updated",
			details: { fields: changed },
		});
	return ok(profile, 200, "Profile saved");
};

export const getOrganizationGeneralHandler: Handler = async (c) => {
	const general = await getOrganizationGeneral(
		membershipFrom(c).organizationId,
	);
	return general ? ok(general) : fail("Not found", 404);
};

export const renameOrganizationHandler: Handler = async (c) => {
	const body = organizationNameInputSchema.safeParse(
		await c.req.json().catch(() => null),
	);
	if (!body.success)
		return fail(body.error.issues[0]?.message ?? "Invalid body", 400);

	const membership = membershipFrom(c);
	const result = await renameOrganization(membership, body.data.name);
	if (!result.ok) return respondWriteError(result.error);
	if (result.data.changed)
		await recordActivity(membership.organizationId, sessionFrom(c).user, {
			action: "organization.renamed",
			details: { fromName: result.data.from, toName: body.data.name },
		});
	return ok({ name: body.data.name }, 200, "Name saved");
};

export const changeOrganizationTimezoneHandler: Handler = async (c) => {
	const body = organizationTimezoneInputSchema.safeParse(
		await c.req.json().catch(() => null),
	);
	if (!body.success)
		return fail(body.error.issues[0]?.message ?? "Invalid body", 400);

	const membership = membershipFrom(c);
	const { timezone } = body.data;
	const result = await changeOrganizationTimezone(membership, timezone);
	if (!result.ok) return respondWriteError(result.error);
	if (result.data.changed)
		await recordActivity(membership.organizationId, sessionFrom(c).user, {
			action: "organization.timezone_changed",
			details: { fromTimezone: result.data.from, toTimezone: timezone },
		});
	return ok({ timezone }, 200, "Timezone saved");
};

export const uploadOrganizationLogoHandler: Handler = async (c) => {
	const membership = membershipFrom(c);
	try {
		const file = await readImageUpload(c.req);
		if (!file) return fail("Missing file", 400);
		const result = await uploadOrganizationLogo(membership, file);
		if (!result.ok) return respondWriteError(result.error);
		await recordActivity(membership.organizationId, sessionFrom(c).user, {
			action: "organization.logo_changed",
			details: {},
		});
		return ok(result.data, 200, "Logo saved");
	} catch (error) {
		if (error instanceof ImageError) return respondImageError(error);
		throw error;
	}
};

export const removeOrganizationLogoHandler: Handler = async (c) => {
	const membership = membershipFrom(c);
	const result = await removeOrganizationLogo(membership);
	if (!result.ok) return respondWriteError(result.error);
	if (result.data.changed)
		await recordActivity(membership.organizationId, sessionFrom(c).user, {
			action: "organization.logo_removed",
			details: {},
		});
	return ok(null, 200, "Logo removed");
};

export const completeOrganizationOnboardingHandler: Handler = async (c) => {
	const result = await completeOrganizationOnboarding(membershipFrom(c));
	if (result.ok) return ok(result.data);

	return result.error === "inactive"
		? respondWriteError(result.error)
		: respondSlotError(result.error);
};

export const activateOrganizationHandler: Handler = async (c) => {
	const { user } = sessionFrom(c);
	const { organizationId } = c.req.params as { organizationId: string };
	const result = await activateOrganization(user.id, organizationId);
	if (!result.ok) return respondSlotError(result.error);
	if (result.data.changed)
		await recordActivity(organizationId, user, {
			action: "organization.activated",
			details: {},
		});
	return ok(null, 200, "Organization activated");
};

export const deactivateOrganizationHandler: Handler = async (c) => {
	const { user } = sessionFrom(c);
	const { organizationId } = c.req.params as { organizationId: string };
	const result = await deactivateOrganization(user.id, organizationId);
	if (!result.found) return fail("Not found", 404);
	if (result.changed)
		await recordActivity(organizationId, user, {
			action: "organization.deactivated",
			details: {},
		});
	return ok(null, 200, "Organization deactivated");
};

export const listActivityHandler: Handler = async (c) => {
	const raw = new URL(c.req.url).searchParams.get("before");
	const before = raw ? parseActivityCursor(raw) : null;
	if (raw && !before) return fail("Invalid cursor", 400);
	return ok(await listActivity(membershipFrom(c).organizationId, before));
};

export const getInvitationPreviewHandler: Handler = async (c) => {
	const { invitationId } = c.req.params as { invitationId: string };
	const preview = await getInvitationPreview(invitationId);
	return preview
		? ok(preview)
		: fail("This invitation is no longer available", 404);
};
