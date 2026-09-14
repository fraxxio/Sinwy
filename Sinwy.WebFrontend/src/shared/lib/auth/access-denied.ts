// A denied route guard runs before the toast provider may have subscribed
// (hard load straight onto a gated URL), so the notice is parked here and
// shown by AccessDeniedToast once the router has settled.
let pending = false;

export const raiseAccessDenied = () => {
	pending = true;
};

export const takeAccessDenied = () => {
	const wasPending = pending;
	pending = false;
	return wasPending;
};
