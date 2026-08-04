import { createLogger } from "@logger";
import { EmailAddress } from "./emailAddresses";
import type { EmailClient, SendOptions } from "./emailClientTypes";

const emailLogger = createLogger("email");

export const consoleEmailClient: EmailClient = {
	send<T>({
		to,
		from = EmailAddress.Default,
		template,
		props,
	}: SendOptions<T>) {
		emailLogger.info("Email delivery skipped", {
			to,
			from,
			subject: template.subject(props),
			props,
		});

		return Promise.resolve();
	},
};
