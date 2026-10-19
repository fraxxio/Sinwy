import { parseArgs } from "node:util";
import { readOutboxEmails } from "@backend/infrastructure/email";
import { assertLocalDev } from "../assertLocalDev";

type EmailFilter = { to?: string; subject?: string };

const hrefsIn = (html: string) =>
	[...html.matchAll(/href="([^"]+)"/g)].flatMap(([, href]) =>
		href ? [href] : [],
	);

/** Newest first, at most `count`. */
export const lastEmails = async ({
	to,
	subject,
	count = 1,
}: EmailFilter & { count?: number }) => {
	const emails = await readOutboxEmails();
	return emails
		.filter(
			({ email }) =>
				(!to || email.to.toLowerCase() === to.toLowerCase()) &&
				(!subject ||
					email.subject.toLowerCase().includes(subject.toLowerCase())),
		)
		.slice(0, count)
		.map(({ file, email: { html, ...email } }) => ({
			...email,
			links: hrefsIn(html),
			file,
		}));
};

if (import.meta.main) {
	assertLocalDev("read sent emails");

	const { values } = parseArgs({
		options: {
			to: { type: "string" },
			subject: { type: "string" },
			count: { type: "string", default: "1" },
		},
	});

	const emails = await lastEmails({ ...values, count: Number(values.count) });
	if (emails.length === 0) {
		console.error(
			"No matching email. Is the backend running with EMAIL_DRIVER=console?",
		);
		process.exit(1);
	}

	console.log(JSON.stringify(emails, null, "\t"));
}
