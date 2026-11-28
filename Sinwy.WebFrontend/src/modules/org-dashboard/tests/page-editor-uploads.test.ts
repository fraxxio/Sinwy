import { describe, expect, it } from "bun:test";
import type { ApiResponse, PageImageDto } from "@sinwy/shared";
import type { ShrinkResult } from "../components/page-editor/images";
import { createUploads } from "../components/page-editor/uploads";

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const KEY = "image-1:src";
const STORED = "https://sinwy.test/api/files/pages/org-1/photo.jpg";

const uploaded: ApiResponse<PageImageDto> = {
	isSuccess: true,
	data: { src: STORED } as PageImageDto,
	message: null,
	code: 201,
};
const offline: ApiResponse<PageImageDto> = {
	isSuccess: false,
	data: null,
	message: "Network error",
	code: 0,
};

const setup = ({
	prepared = { ok: true, blob: new Blob(["jpeg"]), width: 400, height: 300 },
	blockOnPage = () => true,
}: {
	prepared?: ShrinkResult;
	blockOnPage?: () => boolean;
} = {}) => {
	const sends: {
		signal: AbortSignal;
		answer: (res: ApiResponse<PageImageDto>) => Promise<unknown>;
	}[] = [];
	const uploads = createUploads({
		prepare: async () => prepared,
		upload: (_image, signal) =>
			new Promise((resolve) => {
				sends.push({
					signal,
					answer: (res) => {
						resolve(res);
						return settle();
					},
				});
			}),
	});
	const written: { src: string; shape: string }[] = [];
	const pick = () =>
		uploads.pick(KEY, new File(["jpeg"], "salon.jpg"), (src, shape) => {
			if (!blockOnPage()) return false;
			written.push({ src, shape });
			return true;
		});
	const send = (index: number) => {
		const found = sends[index];
		if (!found) throw new Error(`No upload ${index}`);
		return found;
	};
	return { uploads, pick, send, written };
};

const settledFlag = (promise: Promise<void>) => {
	const flag = { done: false };
	void promise.then(() => {
		flag.done = true;
	});
	return flag;
};

describe("upload tracker", () => {
	it("is settled when nothing is uploading", async () => {
		const { uploads } = setup();
		expect(uploads.pending()).toBe(0);
		await uploads.settled();
	});

	it("settles after a successful upload and writes the photo with its shape", async () => {
		const { uploads, pick, send, written } = setup();
		void pick();
		await settle();
		expect(uploads.pending()).toBe(1);
		expect(uploads.view(KEY)?.status).toBe("uploading");
		const settled = settledFlag(uploads.settled());

		await send(0).answer(uploaded);
		expect(settled.done).toBe(true);
		expect(uploads.pending()).toBe(0);
		expect(written).toEqual([{ src: STORED, shape: "wide" }]);
		expect(uploads.view(KEY)).toBeNull();
	});

	it("settles after a failed upload and offers a retry that is tracked again", async () => {
		const { uploads, pick, send, written } = setup();
		void pick();
		await settle();
		const settled = settledFlag(uploads.settled());

		await send(0).answer(offline);
		expect(settled.done).toBe(true);
		const view = uploads.view(KEY);
		expect(view).toMatchObject({ status: "failed" });
		if (view?.status !== "failed" || !view.retry) throw new Error("No retry");

		view.retry();
		expect(uploads.pending()).toBe(1);
		await send(1).answer(uploaded);
		expect(uploads.pending()).toBe(0);
		expect(written).toHaveLength(1);
	});

	it("keeps a photo that finished after its block was deleted, and Retry writes it once the block is back", async () => {
		let onPage = false;
		const { uploads, pick, send, written } = setup({
			blockOnPage: () => onPage,
		});
		void pick();
		await settle();

		await send(0).answer(uploaded);
		expect(uploads.pending()).toBe(0);
		expect(written).toHaveLength(0);
		const view = uploads.view(KEY);
		expect(view).toMatchObject({
			status: "failed",
			message: expect.stringContaining("after its block was deleted"),
		});
		if (view?.status !== "failed" || !view.retry) throw new Error("No retry");

		view.retry();
		expect(uploads.view(KEY)).toMatchObject({ status: "failed" });
		onPage = true;
		view.retry();
		expect(uploads.pending()).toBe(0);
		expect(() => send(1)).toThrow();
		expect(written).toEqual([{ src: STORED, shape: "wide" }]);
		expect(uploads.view(KEY)).toBeNull();
	});

	it("settles when the photo can't be prepared, without uploading", async () => {
		const { uploads, pick, written } = setup({
			prepared: { ok: false, reason: "unreadable" },
		});
		await pick();
		expect(uploads.pending()).toBe(0);
		expect(uploads.view(KEY)).toMatchObject({ status: "failed", retry: null });
		expect(written).toHaveLength(0);
	});

	it("ignores a second pick for a field that is still uploading", async () => {
		const { uploads, pick, send } = setup();
		void pick();
		void pick();
		await settle();
		expect(uploads.pending()).toBe(1);
		await send(0).answer(uploaded);
		expect(() => send(1)).toThrow();
	});

	it("after dispose, aborts the upload, settles and calls nothing back", async () => {
		const { uploads, pick, send, written } = setup();
		void pick();
		await settle();
		const settled = settledFlag(uploads.settled());
		let notified = 0;
		uploads.subscribe(() => notified++);

		uploads.dispose();
		await settle();
		expect(send(0).signal.aborted).toBe(true);
		expect(settled.done).toBe(true);
		expect(uploads.pending()).toBe(0);
		notified = 0;

		await send(0).answer(uploaded);
		expect(written).toHaveLength(0);
		expect(uploads.view(KEY)).toBeNull();
		expect(notified).toBe(0);
	});

	it("after abort, drops the upload in progress and still takes new ones", async () => {
		const { uploads, pick, send, written } = setup();
		void pick();
		await settle();
		uploads.abort();
		expect(uploads.pending()).toBe(0);
		expect(uploads.view(KEY)).toBeNull();
		await send(0).answer(offline);
		expect(uploads.view(KEY)).toBeNull();

		void pick();
		await settle();
		await send(1).answer(uploaded);
		expect(written).toEqual([{ src: STORED, shape: "wide" }]);
	});
});
