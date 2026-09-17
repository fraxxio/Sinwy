import { sessionFrom } from "@authModule";
import { readFormData } from "@backend/lib/app/formData";
import { fail, ok } from "@backend/lib/app/respond";
import type { Handler } from "@backend/lib/app/types";
import { setPasswordSchema } from "@sinwy/shared";
import { APIError } from "better-auth/api";
import { AvatarError } from "./avatar";
import {
	getAccountDeletionPreview,
	getPostLoginFlags,
	removeAvatar,
	setPassword,
	uploadAvatar,
} from "./service";

export const getPostLoginFlagsHandler: Handler = async (c) => {
	const { user } = sessionFrom(c);
	return ok(await getPostLoginFlags(user.id));
};

export const setPasswordHandler: Handler = async (c) => {
	const body = setPasswordSchema.safeParse(
		await c.req.json().catch(() => null),
	);
	if (!body.success)
		return fail(body.error.issues[0]?.message ?? "Invalid body", 400);

	try {
		await setPassword(c.req.headers, body.data);
	} catch (error) {
		if (error instanceof APIError && error.status === "BAD_REQUEST") {
			return fail(error.message, 409);
		}
		throw error;
	}
	return ok(null, 200, "Password set");
};

export const uploadAvatarHandler: Handler = async (c) => {
	const { user } = sessionFrom(c);
	const form = await readFormData(c.req);
	const file = form?.get("file");
	if (!(file instanceof File)) return fail("Missing file", 400);

	try {
		return ok(await uploadAvatar(c.req.headers, user, file));
	} catch (error) {
		if (error instanceof AvatarError) {
			return fail(error.message, error.kind === "too-large" ? 413 : 400);
		}
		throw error;
	}
};

export const removeAvatarHandler: Handler = async (c) => {
	const { user } = sessionFrom(c);
	await removeAvatar(c.req.headers, user);
	return ok(null);
};

export const getDeletionPreviewHandler: Handler = async (c) => {
	const { user } = sessionFrom(c);
	return ok(await getAccountDeletionPreview(user.id));
};
