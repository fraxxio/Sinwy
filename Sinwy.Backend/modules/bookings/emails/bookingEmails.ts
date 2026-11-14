import type { EmailTemplate } from "@backend/infrastructure/email";

const escapeHtml = Bun.escapeHTML;

/** One shape for every booking email; `when` and `previousWhen` are already in the organization's zone. */
export type BookingEmailProps = {
	organizationName: string;
	serviceName: string;
	customerName: string;
	when: string;
	previousWhen: string | null;
	reason: string | null;
	bookingUrl: string | null;
};

const summary = ({ serviceName, organizationName, when }: BookingEmailProps) =>
	`<p><strong>${escapeHtml(serviceName)}</strong> at ${escapeHtml(organizationName)}<br>${escapeHtml(when)}</p>`;

const reasonLine = ({ reason }: BookingEmailProps) =>
	reason ? `<p>Reason: ${escapeHtml(reason)}</p>` : "";

const link = ({ bookingUrl }: BookingEmailProps, label: string) =>
	bookingUrl ? `<p><a href="${bookingUrl}">${label}</a></p>` : "";

const customerLine = ({ customerName }: BookingEmailProps) =>
	`<p>Customer: ${escapeHtml(customerName)}</p>`;

export const BookingRequestReceivedEmail: EmailTemplate<BookingEmailProps> = {
	subject: ({ serviceName, organizationName }) =>
		`Request received: ${serviceName} at ${organizationName}`,
	html: (props) =>
		`<p>Your booking request was sent. ${escapeHtml(props.organizationName)} will confirm it.</p>
${summary(props)}${link(props, "View your booking")}`,
};

export const NewBookingRequestEmail: EmailTemplate<BookingEmailProps> = {
	subject: ({ serviceName, when }) =>
		`New booking request: ${serviceName}, ${when}`,
	html: (props) =>
		`<p>A customer asked to book. Approve or decline the request.</p>
${summary(props)}${customerLine(props)}${link(props, "Review the request")}`,
};

export const BookingConfirmedEmail: EmailTemplate<BookingEmailProps> = {
	subject: ({ serviceName, organizationName }) =>
		`Booking confirmed: ${serviceName} at ${organizationName}`,
	html: (props) =>
		`<p>Your booking is confirmed.</p>
${summary(props)}${link(props, "View your booking")}`,
};

export const NewBookingEmail: EmailTemplate<BookingEmailProps> = {
	subject: ({ serviceName, when }) => `New booking: ${serviceName}, ${when}`,
	html: (props) =>
		`<p>A customer booked.</p>
${summary(props)}${customerLine(props)}${link(props, "Open the booking")}`,
};

export const BookingRequestDeclinedEmail: EmailTemplate<BookingEmailProps> = {
	subject: ({ serviceName, organizationName }) =>
		`Request declined: ${serviceName} at ${organizationName}`,
	html: (props) =>
		`<p>${escapeHtml(props.organizationName)} couldn't take your booking request.</p>
${summary(props)}${reasonLine(props)}`,
};

export const BookingCancelledEmail: EmailTemplate<BookingEmailProps> = {
	subject: ({ serviceName, organizationName }) =>
		`Booking cancelled: ${serviceName} at ${organizationName}`,
	html: (props) =>
		`<p>${escapeHtml(props.organizationName)} cancelled your booking.</p>
${summary(props)}${reasonLine(props)}`,
};

export const CancellationConfirmedEmail: EmailTemplate<BookingEmailProps> = {
	subject: ({ serviceName, organizationName }) =>
		`Cancellation confirmed: ${serviceName} at ${organizationName}`,
	html: (props) =>
		`<p>Your booking is cancelled.</p>
${summary(props)}`,
};

export const BookingCancelledByCustomerEmail: EmailTemplate<BookingEmailProps> =
	{
		subject: ({ serviceName, when }) =>
			`Booking cancelled by customer: ${serviceName}, ${when}`,
		html: (props) =>
			`<p>${escapeHtml(props.customerName)} cancelled their booking.</p>
${summary(props)}${link(props, "Open the booking")}`,
	};

export const BookingMovedEmail: EmailTemplate<BookingEmailProps> = {
	subject: ({ serviceName, organizationName }) =>
		`Booking moved: ${serviceName} at ${organizationName}`,
	html: (props) =>
		`<p>${escapeHtml(props.organizationName)} moved your booking${props.previousWhen ? ` from ${escapeHtml(props.previousWhen)}` : ""}.</p>
${summary(props)}${link(props, "View your booking")}`,
};
