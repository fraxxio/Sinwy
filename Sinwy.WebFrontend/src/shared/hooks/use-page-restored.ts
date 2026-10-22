import { useEffect } from "react";

/**
 * Runs `onRestore` when Back brings the page out of the browser's
 * back/forward cache, where state is exactly as it was left, e.g. mid-redirect.
 */
export function usePageRestored(onRestore: () => void) {
	useEffect(() => {
		const onPageShow = (event: PageTransitionEvent) => {
			if (event.persisted) onRestore();
		};
		window.addEventListener("pageshow", onPageShow);
		return () => window.removeEventListener("pageshow", onPageShow);
	}, [onRestore]);
}
