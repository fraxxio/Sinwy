import type { auth, Membership } from "@authModule";

export type ReqContextValues = {
	session: typeof auth.$Infer.Session;
	membership: Membership;
};
