import dns from "node:dns/promises";
import appConfig from "@config";
import { createLogger } from "@logger";
import { AUTH_ERROR_CODES } from "@sinwy/shared";
import { APIError } from "better-auth/api";

const LOOKUP_TIMEOUT_MS = 2000;
const NO_RECORDS = new Set(["ENOTFOUND", "ENODATA"]);

const emailDomainLogger = createLogger("auth:email-domain");

class LookupTimeout extends Error {}

const records = async <T>(resolve: () => Promise<T[]>) => {
	try {
		return await resolve();
	} catch (error) {
		if (NO_RECORDS.has((error as NodeJS.ErrnoException).code ?? "")) return [];
		throw error;
	}
};

// a lone null MX (RFC 7505) says the domain takes no mail; with no MX at all, A/AAAA is the implicit MX
const acceptsMail = async (domain: string) => {
	const mx = await records(() => dns.resolveMx(domain));
	if (mx.length > 0)
		return mx.some(({ exchange }) => exchange !== "" && exchange !== ".");
	const [ipv4, ipv6] = await Promise.all([
		records(() => dns.resolve4(domain)),
		records(() => dns.resolve6(domain)),
	]);
	return ipv4.length > 0 || ipv6.length > 0;
};

const withTimeout = async <T>(work: Promise<T>) => {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timedOut = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(new LookupTimeout()), LOOKUP_TIMEOUT_MS);
	});
	try {
		return await Promise.race([work, timedOut]);
	} finally {
		clearTimeout(timer);
	}
};

// fails open: a DNS outage must never block sign-up
export const emailDomainAcceptsMail = async (domain: string) => {
	try {
		return await withTimeout(acceptsMail(domain));
	} catch (error) {
		emailDomainLogger.warn("Email domain lookup failed, letting it through", {
			domain,
			reason:
				error instanceof LookupTimeout
					? "timeout"
					: ((error as NodeJS.ErrnoException).code ?? "unknown"),
		});
		return true;
	}
};

export const refuseUndeliverableEmail = async (email: unknown) => {
	if (typeof email !== "string") return;
	const at = email.lastIndexOf("@");
	if (at < 0) return;
	const domain = email.slice(at + 1).toLowerCase();
	if (!domain) return;
	if (appConfig.NODE_ENV !== "prod" && domain.endsWith(".test")) return;
	if (await emailDomainAcceptsMail(domain)) return;
	throw new APIError("BAD_REQUEST", {
		message: "Enter a valid email",
		code: AUTH_ERROR_CODES.EMAIL_DOMAIN_INVALID,
	});
};
