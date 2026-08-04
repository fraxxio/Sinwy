import appConfig from "@config";
import { consoleEmailClient } from "./consoleEmailClient";
import type { EmailClient } from "./emailClientTypes";
import { resendEmailClient } from "./resendEmailClient";

// keyed by EMAIL_DRIVER so adding a driver in appConfig fails here until it has a client
const clients = {
	resend: resendEmailClient,
	console: consoleEmailClient,
} satisfies Record<(typeof appConfig)["EMAIL_DRIVER"], EmailClient>;

export const emailClient = clients[appConfig.EMAIL_DRIVER];
