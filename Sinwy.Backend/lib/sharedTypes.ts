import type { auth } from "@authModule";

export type ReqContextValues = {
	session: typeof auth.$Infer.Session;
};
