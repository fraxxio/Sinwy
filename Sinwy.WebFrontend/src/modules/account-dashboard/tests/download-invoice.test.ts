import { describe, expect, it, mock } from "bun:test";
import type { ApiResponse, InvoiceDownloadDto } from "@sinwy/shared";
import { downloadInvoice, toInvoiceDownload } from "../lib/download-invoice";

const INVOICE_URL = "https://polar.example/invoice.pdf";

const ready: ApiResponse<InvoiceDownloadDto | null> = {
	isSuccess: true,
	data: { url: INVOICE_URL },
	message: null,
	code: 0,
};
const generating: ApiResponse<InvoiceDownloadDto | null> = {
	isSuccess: true,
	data: null,
	message: "The invoice is being generated; try again shortly",
	code: 0,
};
const failure = (
	code: number,
	message: string,
): ApiResponse<InvoiceDownloadDto | null> => ({
	isSuccess: false,
	data: null,
	message,
	code,
});

describe("toInvoiceDownload", () => {
	it("hands out the URL on 200", () => {
		expect(toInvoiceDownload(ready)).toEqual({
			kind: "ready",
			url: INVOICE_URL,
		});
	});

	it("reports 202 as still generating", () => {
		expect(toInvoiceDownload(generating)).toEqual({ kind: "generating" });
	});

	it("reports 409 as missing billing details with the backend message", () => {
		expect(toInvoiceDownload(failure(409, "Billing address missing"))).toEqual({
			kind: "needs-details",
			message: "Billing address missing",
		});
	});

	it("reports anything else as an error", () => {
		expect(toInvoiceDownload(failure(404, "Not found"))).toEqual({
			kind: "error",
			message: "Not found",
		});
		expect(toInvoiceDownload(failure(0, "Network error"))).toEqual({
			kind: "error",
			message: "Network error",
		});
	});
});

describe("downloadInvoice", () => {
	it("saves the file when the URL is ready", async () => {
		const save = mock();

		const result = await downloadInvoice(async () => ready, save);

		expect(result).toEqual({ kind: "downloading" });
		expect(save).toHaveBeenCalledWith(INVOICE_URL);
	});

	it("saves nothing when there is no file", async () => {
		for (const res of [generating, failure(409, "x"), failure(500, "y")]) {
			const save = mock();

			await downloadInvoice(async () => res, save);

			expect(save).not.toHaveBeenCalled();
		}
	});

	it("never returns the presigned URL", async () => {
		const result = await downloadInvoice(
			async () => ready,
			() => {},
		);
		expect(JSON.stringify(result)).not.toContain(INVOICE_URL);
	});
});
