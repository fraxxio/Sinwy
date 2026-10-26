import type { EmailTemplate } from "@backend/infrastructure/email";
import { TRANSFER_OFFER_DAYS } from "@sinwy/shared";

const escapeHtml = Bun.escapeHTML;

export const TransferOfferEmail: EmailTemplate<{
	organizationName: string;
	fromName: string;
	acceptUrl: string;
}> = {
	subject: ({ organizationName }) =>
		`You've been offered ownership of ${organizationName}`,
	html: ({ organizationName, fromName, acceptUrl }) =>
		`<p>${escapeHtml(fromName)} wants to make you the owner of <strong>${escapeHtml(organizationName)}</strong>.</p>
<p>As the owner it runs on your own plan and takes one of its organization slots; without a free slot you choose or upgrade a plan when you accept. <a href="${acceptUrl}">Review the offer</a> within ${TRANSFER_OFFER_DAYS} days.</p>
<p>If you weren't expecting this, you can ignore this email.</p>`,
};

export const TransferCompletedNewOwnerEmail: EmailTemplate<{
	organizationName: string;
	organizationsUrl: string;
}> = {
	subject: ({ organizationName }) => `You now own ${organizationName}`,
	html: ({ organizationName, organizationsUrl }) =>
		`<p>You're now the owner of <strong>${escapeHtml(organizationName)}</strong>. It runs on your plan and uses one of its organization slots.</p>
<p><a href="${organizationsUrl}">Open your organizations</a></p>`,
};

export const TransferCompletedOldOwnerEmail: EmailTemplate<{
	organizationName: string;
	toName: string;
	billingUrl: string;
}> = {
	subject: ({ organizationName }) => `${organizationName} has a new owner`,
	html: ({ organizationName, toName, billingUrl }) =>
		`<p><strong>${escapeHtml(organizationName)}</strong> now belongs to ${escapeHtml(toName)}. You stay on as an admin.</p>
<p>The organization slot it held on your plan is free again. Your plan itself hasn't changed; to pay less, <a href="${billingUrl}">downgrade or cancel it</a>.</p>`,
};
