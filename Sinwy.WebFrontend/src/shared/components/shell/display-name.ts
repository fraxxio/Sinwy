/** Label for the signed-in user: name, falling back to email. */
export const displayName = (
	user: { name: string; email: string } | undefined,
) => user?.name || user?.email || "";
