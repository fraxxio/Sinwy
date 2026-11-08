import type { IReqContext } from "@backend/lib/app/types";
import appConfig from "@config";

/** The visitor's IP: the trusted proxy header's first entry when one is configured, else the socket address. */
export const clientIp = (ctx: IReqContext) => {
	const header = appConfig.TRUSTED_PROXY_HEADER;
	const forwarded = header
		? ctx.req.headers.get(header)?.split(",")[0]?.trim()
		: undefined;
	return forwarded || ctx.server.requestIP(ctx.req)?.address || null;
};
