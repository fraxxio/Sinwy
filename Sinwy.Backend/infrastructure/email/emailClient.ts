import appConfig from "@config";
import { Resend } from "resend";
import { EmailAddress } from "./emailAddresses";
import {
	type EmailClient,
	EmailDeliveryError,
	type SendOptions,
} from "./emailClientTypes";

const resend = new Resend(appConfig.RESEND_API_KEY);

const buildFrom = (local: EmailAddress): string => {
	return `${local}@${appConfig.RESEND_EMAIL_DOMAIN}`;
};

export const emailClient: EmailClient = {
	async send<T>({
		to,
		from = EmailAddress.Default,
		template,
		props,
	}: SendOptions<T>) {
		const { error } = await resend.emails.send({
			from: buildFrom(from),
			to,
			subject: template.subject(props),
			html: template.html(props),
		});

		if (error) {
			throw new EmailDeliveryError(`Failed to deliver email to ${to}`, {
				cause: error,
			});
		}
	},
};
