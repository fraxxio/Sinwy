import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	createLocalStorageClient,
	fileUrl,
	keyFromFileUrl,
} from "@backend/infrastructure/storage";
import { AVATAR_LIMITS, type AvatarMimeType } from "@sinwy/shared";
import { AvatarError, validateAvatar } from "../avatar";

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00];
const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0x00];
const WEBP = [...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBP"), 0];

const imageFile = (bytes: number[], type: string, name = "avatar") =>
	new File([new Uint8Array(bytes)], name, { type });

describe("validateAvatar", () => {
	test.each<[AvatarMimeType, number[]]>([
		["image/png", PNG],
		["image/jpeg", JPEG],
		["image/webp", WEBP],
	])("accepts %s with matching magic bytes", async (type, bytes) => {
		const result = await validateAvatar(imageFile(bytes, type));
		expect(result.type).toBe(type);
		expect([...result.bytes]).toEqual(bytes);
	});

	test("rejects an oversize file", async () => {
		const oversize = new File(
			[new Uint8Array(AVATAR_LIMITS.maxBytes + 1)],
			"big.png",
			{ type: "image/png" },
		);
		await expect(validateAvatar(oversize)).rejects.toMatchObject({
			name: "AvatarError",
			kind: "too-large",
		});
	});

	test("rejects a disallowed mime type", async () => {
		const gif = imageFile([...Buffer.from("GIF89a")], "image/gif");
		await expect(validateAvatar(gif)).rejects.toMatchObject({
			kind: "unsupported-type",
		});
	});

	test("rejects a mime type that does not match the magic bytes", async () => {
		const attempt = validateAvatar(imageFile(JPEG, "image/png"));
		await expect(attempt).rejects.toBeInstanceOf(AvatarError);
		await expect(attempt).rejects.toMatchObject({ kind: "unsupported-type" });
	});
});

describe("localStorageClient", () => {
	let root: string;
	let client: ReturnType<typeof createLocalStorageClient>;

	beforeAll(async () => {
		root = await mkdtemp(join(tmpdir(), "sinwy-storage-"));
		client = createLocalStorageClient(root);
	});

	afterAll(() => rm(root, { recursive: true, force: true }));

	test("put, serve and delete round-trip", async () => {
		const key = "avatars/u1/a.png";
		await client.put(key, new Uint8Array(PNG), "image/png");

		const served = await client.serve(key);
		expect(served.status).toBe(200);
		expect(served.headers.get("cache-control")).toContain("immutable");
		expect([...new Uint8Array(await served.arrayBuffer())]).toEqual(PNG);

		await client.delete(key);
		expect((await client.serve(key)).status).toBe(404);
	});

	test("deleting a missing key is a no-op", async () => {
		await expect(client.delete("avatars/none.png")).resolves.toBeUndefined();
	});

	test("rejects keys that escape the storage root", async () => {
		await expect(client.serve("../outside.txt")).rejects.toThrow();
		await expect(
			client.put("/etc/passwd", new Uint8Array(), "text/plain"),
		).rejects.toThrow();
		await expect(client.delete("a/../../b")).rejects.toThrow();
	});
});

describe("keyFromFileUrl", () => {
	test("returns the key for a URL we serve", () => {
		expect(keyFromFileUrl(fileUrl("avatars/u1/a.png"))).toBe(
			"avatars/u1/a.png",
		);
	});

	test("returns null for a foreign or empty URL", () => {
		expect(keyFromFileUrl("https://lh3.googleusercontent.com/a/x")).toBeNull();
		expect(keyFromFileUrl(fileUrl(""))).toBeNull();
		expect(keyFromFileUrl(null)).toBeNull();
		expect(keyFromFileUrl(undefined)).toBeNull();
	});
});
