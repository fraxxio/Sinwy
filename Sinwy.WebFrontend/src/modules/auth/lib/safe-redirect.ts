/** A same-origin path to return to after auth, or undefined for anything that could leave the site. */
export const safeRedirect = (path: string | undefined) =>
	path?.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\")
		? path
		: undefined;
