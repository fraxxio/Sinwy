import type { BunRequest } from "bun";
import type {
	BunRouteHandler,
	Handler,
	HTTPMethod,
	IReqContext,
	Middleware,
	ReqContextValues,
	Route,
} from "./types";

class ReqContext implements IReqContext {
	req: BunRequest<string>;
	private store: Partial<ReqContextValues> = {};

	constructor(req: BunRequest<string>) {
		this.req = req;
	}

	set<K extends keyof ReqContextValues>(key: K, value: ReqContextValues[K]) {
		this.store[key] = value;
	}

	get<K extends keyof ReqContextValues>(
		key: K,
	): ReqContextValues[K] | undefined {
		return this.store[key];
	}
}

const compose = (middlewares: Middleware[], handler: Handler): Handler => {
	return async (ctx) => {
		let index = -1;

		async function dispatch(i: number): Promise<Response> {
			if (i <= index) throw new Error("next() called multiple times");
			index = i;

			const fn = middlewares[i];

			if (!fn) {
				return handler(ctx);
			}

			return fn(ctx, () => dispatch(i + 1));
		}

		return dispatch(0);
	};
};

const createApp = () => {
	const routes: Route[] = [];
	const middlewares: Middleware[] = [];

	return {
		use(mw: Middleware) {
			middlewares.push(mw);
			return this;
		},

		route(
			path: string,
			handler: Handler,
			options?: {
				method?: HTTPMethod | HTTPMethod[];
				routeMiddlewares?: Middleware[];
			},
		) {
			routes.push({
				method: options?.method ?? "GET",
				path,
				handler,
				middlewares: options?.routeMiddlewares ?? [],
			});
			return this;
		},

		listen(port: number) {
			const bunRoutes: Record<string, BunRouteHandler> = {};

			for (const r of routes) {
				const composed = compose([...middlewares, ...r.middlewares], r.handler);
				let routeHandlers = bunRoutes[r.path];

				if (!routeHandlers) {
					routeHandlers = {};
					bunRoutes[r.path] = routeHandlers;
				}

				const methods = Array.isArray(r.method) ? r.method : [r.method];

				for (const method of methods) {
					routeHandlers[method] = (req: BunRequest<string>) => {
						const ctx = new ReqContext(req);
						return composed(ctx);
					};
				}
			}

			return Bun.serve({
				port,
				routes: bunRoutes,
				fetch(req) {
					const url = new URL(req.url);
					const route = bunRoutes[url.pathname];

					if (!route) return new Response("Not Found", { status: 404 });

					const handler = route[req.method as HTTPMethod];
					if (!handler) {
						return new Response("Method Not Allowed", {
							status: 405,
						});
					}

					return new Response("Not Found", { status: 404 });
				},
			});
		},
	};
};

export default createApp;
