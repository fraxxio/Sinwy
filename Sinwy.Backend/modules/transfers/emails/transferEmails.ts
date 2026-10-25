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
<p>As the owner you pay for its plan with your own payment method, from the day you accept. <a href="${acceptUrl}">Review the offer</a> within ${TRANSFER_OFFER_DAYS} days.</p>
<p>If you weren't expecting this, you can ignore this email.</p>`,
};

export const TransferCompletedNewOwnerEmail: EmailTemplate<{
	organizationName: string;
}> = {
	subject: ({ organizationName }) => `You now own ${organizationName}`,
	html: ({ organizationName }) =>
		`<p>You're now the owner of <strong>${escapeHtml(organizationName)}</strong>, and its plan is billed to your subscription.</p>`,
};

export const TransferCompletedOldOwnerEmail: EmailTemplate<{
	organizationName: string;
	toName: string;
}> = {
	subject: ({ organizationName }) => `${organizationName} has a new owner`,
	html: ({ organizationName, toName }) =>
		`<p><strong>${escapeHtml(organizationName)}</strong> now belongs to ${escapeHtml(toName)}. You stay on as an admin.</p>
<p>Your subscription for it has ended, and the unused time is refunded to your payment method.</p>`,
};
