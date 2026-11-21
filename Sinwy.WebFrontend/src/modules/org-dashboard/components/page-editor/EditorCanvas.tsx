import { type Overrides, Puck, useGetPuck } from "@puckeditor/core";
import {
	type ReactNode,
	useLayoutEffect,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import { setCanvasZoom } from "./BlockChrome";
import { usePuck } from "./editor-config";

let canvasDocument: Document | null = null;
const documentListeners = new Set<() => void>();

const setCanvasDocument = (doc: Document | null) => {
	if (doc === canvasDocument) return;
	canvasDocument = doc;
	for (const listener of documentListeners) listener();
};

/** The canvas iframe's document once Puck has mounted it, for listeners that must also work inside the canvas. */
export const useCanvasDocument = () =>
	useSyncExternalStore(
		(listener) => {
			documentListeners.add(listener);
			return () => documentListeners.delete(listener);
		},
		() => canvasDocument,
		() => null,
	);

function CanvasFrame({
	children,
	document,
}: {
	children: ReactNode;
	document?: Document;
}) {
	useLayoutEffect(() => {
		setCanvasDocument(document ?? null);
		return () => setCanvasDocument(null);
	}, [document]);
	return children;
}

export const canvasOverrides: Partial<Overrides> = {
	iframe: (props) => <CanvasFrame {...props} />,
};

/** Puck's own canvas isn't exported: this one sizes the preview to the viewport and scales it down to fit. */
export function EditorCanvas() {
	const getPuck = useGetPuck();
	const width = usePuck((s) => s.appState.ui.viewports.current.width);
	const ref = useRef<HTMLDivElement>(null);
	const [box, setBox] = useState({ width: 0, height: 0 });

	useLayoutEffect(() => {
		const element = ref.current;
		if (!element) return;
		const observer = new ResizeObserver(([entry]) => {
			if (entry)
				setBox({
					width: entry.contentRect.width,
					height: entry.contentRect.height,
				});
		});
		observer.observe(element);
		return () => observer.disconnect();
	}, []);

	const frameWidth = typeof width === "number" ? width : box.width;
	const zoom =
		box.width && frameWidth ? Math.min(1, box.width / frameWidth) : 1;

	useLayoutEffect(() => setCanvasZoom(zoom), [zoom]);

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: clicking around the page deselects, as in Puck's own canvas
		// biome-ignore lint/a11y/useKeyWithClickEvents: keyboard deselection comes with the editor's shortcuts
		<div
			className="relative min-w-0 flex-1 bg-muted/50 p-6"
			onClick={(event) => {
				if (event.target === event.currentTarget)
					getPuck().dispatch({ type: "setUi", ui: { itemSelector: null } });
			}}
		>
			<div ref={ref} className="pointer-events-none size-full">
				<div
					className="pointer-events-auto mx-auto"
					style={{ width: frameWidth * zoom, height: box.height }}
				>
					<div
						className="overflow-hidden rounded-xl bg-background shadow-sm ring-1 ring-border [&_iframe]:block [&_iframe]:size-full"
						style={{
							width: frameWidth,
							height: box.height / zoom,
							transform: `scale(${zoom})`,
							transformOrigin: "top left",
						}}
					>
						<Puck.Preview />
					</div>
				</div>
			</div>
		</div>
	);
}
