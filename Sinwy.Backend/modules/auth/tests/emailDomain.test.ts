import { afterEach, beforeEach, expect, jest, spyOn, test } from "bun:test";
import dns from "node:dns/promises";
import appConfig from "@config";
import { AUTH_ERROR_CODES } from "@sinwy/shared";
import {
	emailDomainAcceptsMail,
	refuseUndeliverableEmail,
} from "../emailDomain";

const dnsError = (code: string) =>
	Object.assign(new Error(`queryMx ${code}`), { code });

let resolveMx: ReturnType<typeof spyOn<typeof dns, "resolveMx">>;
let resolve4: ReturnType<typeof spyOn<typeof dns, "resolve4">>;
let resolve6: ReturnType<typeof spyOn<typeof dns, "resolve6">>;

beforeEach(() => {
	resolveMx = spyOn(dns, "resolveMx").mockRejectedValue(dnsError("ENOTFOUND"));
	resolve4 = spyOn(dns, "resolve4").mockRejectedValue(dnsError("ENOTFOUND"));
	resolve6 = spyOn(dns, "resolve6").mockRejectedValue(dnsError("ENOTFOUND"));
});

afterEach(() => {
	resolveMx.mockRestore();
	resolve4.mockRestore();
	resolve6.mockRestore();
	jest.useRealTimers();
});

test("a domain that doesn't exist is refused", async () => {
	expect(await emailDomainAcceptsMail("gmail.con")).toBe(false);
});

test("a domain with no records of any kind is refused", async () => {
	resolveMx.mockRejectedValue(dnsError("ENODATA"));
	resolve4.mockRejectedValue(dnsError("ENODATA"));
	resolve6.mockRejectedValue(dnsError("ENODATA"));
	expect(await emailDomainAcceptsMail("parked.example")).toBe(false);
});

test("an MX record passes without an address lookup", async () => {
	resolveMx.mockResolvedValue([{ priority: 5, exchange: "mx.gmail.com" }]);
	expect(await emailDomainAcceptsMail("gmail.com")).toBe(true);
	expect(resolve4).not.toHaveBeenCalled();
	expect(resolve6).not.toHaveBeenCalled();
});

test("an A or AAAA record alone passes as an implicit MX", async () => {
	resolveMx.mockRejectedValue(dnsError("ENODATA"));
	resolve4.mockResolvedValue(["192.0.2.1"]);
	expect(await emailDomainAcceptsMail("a-only.example")).toBe(true);

	resolve4.mockRejectedValue(dnsError("ENODATA"));
	resolve6.mockResolvedValue(["2001:db8::1"]);
	expect(await emailDomainAcceptsMail("aaaa-only.example")).toBe(true);
});

test("a lone null MX is refused even with an A record", async () => {
	resolveMx.mockResolvedValue([{ priority: 0, exchange: "" }]);
	resolve4.mockResolvedValue(["192.0.2.1"]);
	expect(await emailDomainAcceptsMail("example.com")).toBe(false);
});

test("a DNS failure lets the address through", async () => {
	resolveMx.mockRejectedValue(dnsError("ESERVFAIL"));
	expect(await emailDomainAcceptsMail("flaky.example")).toBe(true);

	resolveMx.mockRejectedValue(dnsError("ENODATA"));
	resolve6.mockRejectedValue(dnsError("ETIMEOUT"));
	expect(await emailDomainAcceptsMail("flaky.example")).toBe(true);
});

test("a lookup that hangs lets the address through after the timeout", async () => {
	jest.useFakeTimers();
	resolveMx.mockReturnValue(new Promise(() => {}));
	const accepted = emailDomainAcceptsMail("slow.example");
	jest.advanceTimersByTime(2000);
	expect(await accepted).toBe(true);
});

test("refusal is a 400 with the email field's message", async () => {
	await expect(
		refuseUndeliverableEmail("someone@Gmail.Con"),
	).rejects.toMatchObject({
		statusCode: 400,
		body: {
			code: AUTH_ERROR_CODES.EMAIL_DOMAIN_INVALID,
			message: "Enter a valid email",
		},
	});
	expect(resolveMx).toHaveBeenCalledWith("gmail.con");
});

test(".test domains skip the lookup outside prod and are looked up in prod", async () => {
	await refuseUndeliverableEmail("someone@sinwy.test");
	expect(resolveMx).not.toHaveBeenCalled();

	const nodeEnv = appConfig.NODE_ENV;
	appConfig.NODE_ENV = "prod";
	try {
		await expect(
			refuseUndeliverableEmail("someone@sinwy.test"),
		).rejects.toMatchObject({
			body: { code: AUTH_ERROR_CODES.EMAIL_DOMAIN_INVALID },
		});
	} finally {
		appConfig.NODE_ENV = nodeEnv;
	}
	expect(resolveMx).toHaveBeenCalledWith("sinwy.test");
});
