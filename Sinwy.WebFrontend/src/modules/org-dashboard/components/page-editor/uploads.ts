import type { ApiResponse, PageImageDto } from "@sinwy/shared";
import { type ImageShape, type ShrinkResult, shapeFor } from "./images";

export type UploadView =
	| { status: "preparing" }
	| { status: "uploading"; preview: string }
	| {
			status: "failed";
			message: string;
			preview: string | null;
			retry: (() => void) | null;
	  };

export type WriteImage = (src: string, shape: ImageShape) => void;

const MESSAGES = {
	unreadable:
		"This file can't be read as a photo. Choose a JPEG, PNG or another image.",
	"too-large":
		"This photo is still over 2 MB after shrinking. Choose a smaller photo.",
	network: "The photo didn't upload. Check your connection and try again.",
};

const previewOf = (view: UploadView | undefined) =>
	view && "preview" in view ? view.preview : null;

export const isBusy = (view: UploadView | null | undefined) =>
	view?.status === "preparing" || view?.status === "uploading";

/**
 * The editor's photo uploads, each shown under its own key (block and field),
 * so a reselected block still shows its upload and Publish and leaving can
 * wait for them. An aborted upload neither writes nor shows anything.
 */
export function createUploads({
	prepare,
	upload,
}: {
	prepare: (file: File) => Promise<ShrinkResult>;
	upload: (
		image: Blob,
		signal: AbortSignal,
	) => Promise<ApiResponse<PageImageDto>>;
}) {
	const views = new Map<string, UploadView>();
	const running = new Set<AbortController>();
	const listeners = new Set<() => void>();
	let idle: PromiseWithResolvers<void> | null = null;
	let disposed = false;

	const emit = () => {
		for (const listener of listeners) listener();
	};

	const show = (key: string, view: UploadView | null) => {
		const old = previewOf(views.get(key));
		if (old && old !== previewOf(view ?? undefined)) URL.revokeObjectURL(old);
		if (view) views.set(key, view);
		else views.delete(key);
		emit();
	};

	const release = (controller: AbortController) => {
		if (!running.delete(controller)) return;
		if (running.size === 0) {
			idle?.resolve();
			idle = null;
		}
		emit();
	};

	const track = async (work: (signal: AbortSignal) => Promise<void>) => {
		const controller = new AbortController();
		running.add(controller);
		emit();
		try {
			await work(controller.signal);
		} finally {
			release(controller);
		}
	};

	const pick = (key: string, file: File, write: WriteImage) => {
		if (disposed || isBusy(views.get(key))) return Promise.resolve();
		const send = async (
			signal: AbortSignal,
			image: Blob,
			preview: string,
			shape: ImageShape,
		) => {
			show(key, { status: "uploading", preview });
			const res = await upload(image, signal);
			if (signal.aborted) return;
			if (res.isSuccess) {
				write(res.data.src, shape);
				show(key, null);
				return;
			}
			const retryable = res.code === 0 || res.code >= 500;
			show(key, {
				status: "failed",
				message: res.code === 0 ? MESSAGES.network : res.message,
				preview,
				retry: retryable
					? () => {
							if (!disposed && !isBusy(views.get(key)))
								void track((next) => send(next, image, preview, shape));
						}
					: null,
			});
		};
		return track(async (signal) => {
			show(key, { status: "preparing" });
			const shrunk = await prepare(file);
			if (signal.aborted) return;
			if (!shrunk.ok) {
				show(key, {
					status: "failed",
					message: MESSAGES[shrunk.reason],
					preview: null,
					retry: null,
				});
				return;
			}
			await send(
				signal,
				shrunk.blob,
				URL.createObjectURL(shrunk.blob),
				shapeFor(shrunk.width, shrunk.height),
			);
		});
	};

	/** Stops every upload in progress; their files stay on the server until the sweep. */
	const abort = () => {
		for (const controller of running) {
			controller.abort();
			release(controller);
		}
		for (const [key, view] of views) if (isBusy(view)) show(key, null);
	};

	return {
		pick,
		view: (key: string): UploadView | null => views.get(key) ?? null,
		/** Clears a shown failure, once the field has a photo from elsewhere. */
		dismiss: (key: string) => {
			if (views.get(key)?.status === "failed") show(key, null);
		},
		pending: () => running.size,
		/** Resolves once no upload is in progress, however the last one ended. */
		settled: () => {
			if (running.size === 0) return Promise.resolve();
			idle ??= Promise.withResolvers<void>();
			return idle.promise;
		},
		subscribe: (listener: () => void) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		abort,
		dispose: () => {
			abort();
			disposed = true;
			for (const key of views.keys()) show(key, null);
			listeners.clear();
		},
	};
}

export type Uploads = ReturnType<typeof createUploads>;
