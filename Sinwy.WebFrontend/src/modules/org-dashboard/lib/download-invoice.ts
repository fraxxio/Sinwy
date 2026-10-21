import type { ApiResponse, InvoiceDownloadDto } from "@sinwy/shared";

export type InvoiceDownload =
	| { kind: "ready"; url: string }
	| { kind: "generating" }
	| { kind: "needs-details"; message: string }
	| { kind: "error"; message: string };

/** What the caller learns; the presigned URL never leaves this file. */
export type InvoiceDownloadResult =
	| { kind: "downloading" }
	| Exclude<InvoiceDownload, { kind: "ready" }>;

export function toInvoiceDownload(
	res: ApiResponse<InvoiceDownloadDto | null>,
): InvoiceDownload {
	if (res.isSuccess)
		return res.data
			? { kind: "ready", url: res.data.url }
			: { kind: "generating" };
	// 409 is Polar refusing to render it, e.g. no billing address yet
	if (res.code === 409) return { kind: "needs-details", message: res.message };
	return { kind: "error", message: res.message };
}

// Polar signs the URL with Content-Disposition: attachment, so the browser
// saves the file and the page stays where it is
const saveFile = (url: string) => window.location.assign(url);

export async function downloadInvoice(
	request: () => Promise<ApiResponse<InvoiceDownloadDto | null>>,
	save: (url: string) => void = saveFile,
): Promise<InvoiceDownloadResult> {
	const download = toInvoiceDownload(await request());
	if (download.kind !== "ready") return download;
	save(download.url);
	return { kind: "downloading" };
}
