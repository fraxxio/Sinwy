import appConfig from "@config";

type SendEmailArgs = {
	to: string;
	subject: string;
	html: string;
};

export async function sendEmail({ to, subject, html }: SendEmailArgs) {
	const res = await fetch("https://api.resend.com/emails", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${appConfig.RESEND_API_KEY}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			from: appConfig.RESEND_FROM_EMAIL,
			to,
			subject,
			html,
		}),
	});

	if (!res.ok) {
		throw new Error(`Resend send failed: ${res.status} ${await res.text()}`);
	}
}
