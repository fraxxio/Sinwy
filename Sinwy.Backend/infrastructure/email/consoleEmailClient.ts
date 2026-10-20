import { createLogger } from "@logger";
import { EmailAddress } from "./emailAddresses";
import type { EmailClient, SendOptions } from "./emailClientTypes";
import { writeOutboxEmail } from "./emailOutbox";

const emailLogger = createLogger("email");

export const consoleEmailClient: EmailClient = {
	async send<T>({
		to,
		from = EmailAddress.Default,
		template,
		props,
	}: SendOptions<T>) {
		const subject = template.subject(props);
		const file = await writeOutboxEmail({
			sentAt: new Date().toISOString(),
			to,
			from,
			subject,
			html: template.html(props),
			props,
		});

		emailLogger.info("Email delivery skipped", {
			to,
			from,
			subject,
			props,
			file,
		});
	},
};
