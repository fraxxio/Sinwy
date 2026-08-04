import appConfig from "@config";
import { Resend } from "resend";
import { EmailAddress } from "./emailAddresses";
import {
	type EmailClient,
	EmailDeliveryError,
	type SendOptions,
} from "./emailClientTypes";

// built on first send so setups running the console driver need no Resend credentials
let resend: Resend | undefined;

const buildFrom = (local: EmailAddress): string => {
	return `${local}@${appConfig.RESEND_EMAIL_DOMAIN}`;
};

export const resendEmailClient: EmailClient = {
	async send<T>({
		to,
		from = EmailAddress.Default,
		template,
		props,
	}: SendOptions<T>) {
		resend ??= new Resend(appConfig.RESEND_API_KEY);

		const subject = template.subject(props);
		const { error } = await resend.emails.send({
			from: buildFrom(from),
			to,
			subject,
			html: template.html(props),
		});

		if (error) {
			throw new EmailDeliveryError(`Failed to deliver "${subject}" to ${to}`, {
				cause: error,
			});
		}
	},
};
