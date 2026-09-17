const boundaryPattern = /;\s*boundary=(?:"([^"]+)"|([^;]+))/i;

/**
 * Parses a multipart/form-data body with Bun's native parser. `Request.formData()`
 * is typed through undici, whose deprecation notice targets Node's parser, not Bun's.
 * Returns null when the body is not multipart or fails to parse.
 */
export const readFormData = (req: Request): Promise<FormData | null> => {
	const contentType = req.headers.get("content-type") ?? "";
	if (!contentType.toLowerCase().startsWith("multipart/form-data") || !req.body)
		return Promise.resolve(null);

	const match = boundaryPattern.exec(contentType);
	const boundary = (match?.[1] ?? match?.[2])?.trim();
	if (!boundary) return Promise.resolve(null);

	return Bun.readableStreamToFormData(req.body, boundary).catch(() => null);
};
