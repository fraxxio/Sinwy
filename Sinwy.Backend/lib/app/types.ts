import type { ReqContextValues } from "@backend/lib/sharedTypes";
import type { BunRequest } from "bun";

export interface IReqContext {
	req: BunRequest<string>;
	set<K extends keyof ReqContextValues>(
		key: K,
		value: ReqContextValues[K],
	): void;
	get<K extends keyof ReqContextValues>(
		key: K,
	): ReqContextValues[K] | undefined;
}

export type Handler = (ctx: IReqContext) => Response | Promise<Response>;

export type Middleware = (
	ctx: IReqContext,
	next: () => Promise<Response>,
) => Promise<Response>;

export type HTTPMethod =
	| "GET"
	| "POST"
	| "PUT"
	| "DELETE"
	| "PATCH"
	| "HEAD"
	| "OPTIONS";

export type Route = {
	method: HTTPMethod | HTTPMethod[];
	path: string;
	handler: Handler;
	middlewares: Middleware[];
};

export type BunRouteHandler = Partial<
	Record<HTTPMethod, (req: BunRequest<string>) => Response | Promise<Response>>
>;
