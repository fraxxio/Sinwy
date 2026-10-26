import type { EmailTemplate } from "@backend/infrastructure/email";

const escapeHtml = Bun.escapeHTML;

export const OrganizationsDeactivatedEmail: EmailTemplate<{
	organizationNames: string[];
	organizationLimit: number;
	manageUrl: string;
}> = {
	subject: ({ organizationNames }) =>
		organizationNames.length === 1
			? `${organizationNames[0]} is no longer active`
			: `${organizationNames.length} of your organizations are no longer active`,
	html: ({ organizationNames, organizationLimit, manageUrl }) =>
		`<p>Your plan now keeps ${organizationLimit} ${organizationLimit === 1 ? "organization" : "organizations"} active, so these went inactive:</p>
<ul>${organizationNames.map((name) => `<li>${escapeHtml(name)}</li>`).join("")}</ul>
<p>The ones you activated first stayed active. Their data is kept. To bring one back, deactivate another or upgrade your plan in <a href="${manageUrl}">Account → Organizations</a>.</p>`,
};
