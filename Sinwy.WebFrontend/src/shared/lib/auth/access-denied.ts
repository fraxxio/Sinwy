// A denied route guard runs before the toast provider may have subscribed
// (hard load straight onto a gated URL), so the notice is parked here and
// shown by AccessDeniedToast once the router has settled.
let pending: string | null = null;

export const raiseAccessDenied = (
	title = "You don't have access to that page",
) => {
	pending = title;
};

export const takeAccessDenied = () => {
	const title = pending;
	pending = null;
	return title;
};
