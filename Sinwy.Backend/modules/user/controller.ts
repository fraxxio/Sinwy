import { sessionFrom } from "@authModule";
import { ok } from "@backend/lib/app/respond";
import type { Handler } from "@backend/lib/app/types";
import { getPostLoginFlags } from "./service";

export const getPostLoginFlagsHandler: Handler = async (c) => {
	const { user } = sessionFrom(c);
	return ok(await getPostLoginFlags(user.id));
};
