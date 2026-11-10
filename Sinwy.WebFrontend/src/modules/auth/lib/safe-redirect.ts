const ORIGIN = "http://same.invalid";

/** A same-origin path to return to after auth, or undefined for anything that could leave the site. */
export const safeRedirect = (path: string | undefined) =>
	path?.startsWith("/") &&
	URL.canParse(path, ORIGIN) &&
	new URL(path, ORIGIN).origin === ORIGIN
		? path
		: undefined;
