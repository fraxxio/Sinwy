import { type EmailTemplate, emailClient } from "@backend/infrastructure/email";
import { majorUnits } from "@backend/lib/csv";
import { formatLocalTime } from "@backend/lib/localDate";
import appConfig from "@config";
import { createLogger } from "@logger";
import { notifyOrganization } from "@notificationsModule";
import { listNotificationRecipients } from "@organizationsModule";
import { findPaymentNotice } from "./repository";

const logger = createLogger("payments");

const escapeHtml = Bun.escapeHTML;

export type PaymentRecordedEmailProps = {
	organizationName: string;
	serviceName: string;
	customerName: string;
	amount: string;
	when: string;
	recordedBy: string;
	bookingUrl: string;
};

export const PaymentRecordedEmail: EmailTemplate<PaymentRecordedEmailProps> = {
	subject: ({ amount, serviceName }) =>
		`Payment recorded: ${amount} for ${serviceName}`,
	html: (props) =>
		`<p>${escapeHtml(props.recordedBy)} marked a payment of <strong>${escapeHtml(props.amount)}</strong> as paid.</p>
<p><strong>${escapeHtml(props.serviceName)}</strong> at ${escapeHtml(props.organizationName)}<br>${escapeHtml(props.when)}</p>
<p>Customer: ${escapeHtml(props.customerName)}</p>
<p><a href="${props.bookingUrl}">Open the booking</a></p>`,
};

const formatAmount = (amountMinor: number, currency: string) =>
	new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(
		Number(majorUnits(amountMinor, currency)),
	);

/** Call after the payment is marked paid; the actor is neither emailed nor notified. A failure is logged and never reaches the caller. */
export const sendPaymentRecordedEmails = async (
	organizationId: string,
	paymentId: string,
	actor: { id: string; name: string },
) => {
	try {
		const notice = await findPaymentNotice(organizationId, paymentId);
		if (!notice) return;
		const recipients = await listNotificationRecipients(
			organizationId,
			"payment.recorded",
			{ exceptUserId: actor.id },
		);
		const { organization } = notice;
		const bookingPath = `/dashboard/${organization.slug}/bookings/${notice.bookingId}`;
		const props: PaymentRecordedEmailProps = {
			organizationName: organization.name,
			serviceName: notice.serviceName,
			customerName: notice.customerName,
			amount: formatAmount(notice.amountMinor, notice.currency),
			when: formatLocalTime(notice.startsAt, organization.timezone),
			recordedBy: actor.name,
			bookingUrl: new URL(bookingPath, appConfig.WEB_APP_URL).toString(),
		};
		await Promise.all(
			recipients.map((to) =>
				emailClient
					.send({ to, template: PaymentRecordedEmail, props })
					.catch((error) =>
						logger.warn("Payment email failed", { paymentId, error }),
					),
			),
		);
		await notifyOrganization(
			organizationId,
			{
				type: "payment.recorded",
				payload: {
					serviceName: notice.serviceName,
					amount: props.amount,
					recordedByName: actor.name,
				},
			},
			bookingPath,
			{ exceptUserId: actor.id },
		);
	} catch (error) {
		logger.warn("Payment emails failed", { paymentId, error });
	}
};
