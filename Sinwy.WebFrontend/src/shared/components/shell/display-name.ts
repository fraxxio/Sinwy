/** Label for the signed-in user: name, falling back to email. */
export const displayName = (
	user: { name: string; email: string } | undefined,
) => user?.name || user?.email || "";

/** Up to two initials for an avatar fallback. */
export const initials = (name: string) =>
	name
		.split(" ")
		.filter(Boolean)
		.slice(0, 2)
		.map((part) => part[0]?.toUpperCase() ?? "")
		.join("") || "?";
