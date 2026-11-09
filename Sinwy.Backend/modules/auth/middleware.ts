import { fail } from "@backend/lib/app/respond";
import type { IReqContext, Middleware } from "@backend/lib/app/types";
import { auth } from "./auth";

export const sessionFrom = (ctx: IReqContext) => {
	const session = ctx.get("session");
	if (!session) throw new Error("Route is missing the requireAuth middleware");
	return session;
};

/** The signed-in session, or null for an anonymous request; for routes without `requireAuth`. */
export const findSession = async (ctx: IReqContext) =>
	ctx.get("session") ??
	(await auth.api.getSession({ headers: ctx.req.headers }));

export const requireAuth: Middleware = async (ctx, next) => {
	const session = await auth.api.getSession({ headers: ctx.req.headers });
	if (!session) return fail("Unauthorized", 401);

	ctx.set("session", session);
	return next();
};
