import { describe, expect, test } from "bun:test";
import { bookingLink, isSafeLink, linkTarget, webAddress } from "@sinwy/shared";

const SERVICE_ID = "0b6f3c1e-8a4d-4c2b-9f7e-2d5a1b3c4e6f";

describe("isSafeLink", () => {
	test("accepts one service's booking", () => {
		expect(isSafeLink(`book?service=${SERVICE_ID}`)).toBe(true);
		expect(isSafeLink("book?service=svc_1")).toBe(true);
	});

	test.each([
		"book?service=",
		"book?service=a&x=1",
		"about?service=x",
		"book?x=1",
		"book?service=<script>",
		'book?service="x"',
		"book?service=a b",
	])("refuses %s", (href) => expect(isSafeLink(href)).toBe(false));
});

describe("linkTarget", () => {
	test("reads booking and one service's booking", () => {
		expect(linkTarget("book")).toEqual({ kind: "booking" });
		expect(linkTarget(`book?service=${SERVICE_ID}`)).toEqual({
			kind: "service",
			serviceId: SERVICE_ID,
		});
	});

	test.each([
		"",
		"https://example.com",
		"/x",
		"tel:+3701234567",
		"mailto:a@b.c",
		"#prices",
		"about-us",
		"services/cuts",
		"book/extra",
		"book?service=",
	])("reads %p as a web address, as stored", (href) =>
		expect(linkTarget(href)).toEqual({ kind: "web", href }));
});

test("bookingLink writes what linkTarget reads", () => {
	expect(bookingLink()).toBe("book");
	expect(linkTarget(bookingLink(SERVICE_ID))).toEqual({
		kind: "service",
		serviceId: SERVICE_ID,
	});
});

describe("webAddress", () => {
	test("adds https:// to a bare domain, trimmed", () => {
		expect(webAddress("example.com")).toBe("https://example.com");
		expect(webAddress(" www.example.com/a ")).toBe("https://www.example.com/a");
		expect(webAddress("example.com:8080/x")).toBe("https://example.com:8080/x");
	});

	test.each([
		"https://example.com",
		"http://example.com",
		"mailto:a@b.c",
		"tel:+370.123",
		"#x",
		"/x",
		"/files/menu.pdf",
		"about-us",
		"",
	])("leaves %p alone", (text) => expect(webAddress(text)).toBe(text));

	test("a bare domain becomes a safe link", () =>
		expect(isSafeLink(webAddress("example.com"))).toBe(true));
});
