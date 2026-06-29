import type { EmailAddress } from "./emailAddresses";

export interface EmailTemplate<T> {
	subject(props: T): string;
	html(props: T): string;
}

export interface SendOptions<T> {
	to: string;
	from?: EmailAddress;
	template: EmailTemplate<T>;
	props: T;
}

export interface EmailClient {
	send<T>(options: SendOptions<T>): Promise<void>;
}

export class EmailDeliveryError extends Error {
	constructor(message: string, options?: { cause?: unknown }) {
		super(message, options);
		this.name = "EmailDeliveryError";
	}
}
