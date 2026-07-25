import type * as React from "react";

export function Img(props: React.ImgHTMLAttributes<HTMLImageElement>) {
	// biome-ignore lint/a11y/useAltText: alt is forwarded via props by the caller
	return <img loading="lazy" decoding="async" {...props} />;
}
