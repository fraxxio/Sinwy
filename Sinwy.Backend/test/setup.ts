import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SQL } from "bun";
import { config } from "dotenv";

// Force the test database and storage dir BEFORE any app module loads appConfig —
// integration tests truncate tables and write files, and must never touch dev data.
process.env["POSTGRES_DB"] = "sinwy_test";
process.env["STORAGE_LOCAL_DIR"] = mkdtempSync(
	join(tmpdir(), "sinwy-storage-"),
);

// dotenv never overrides already-set vars, so POSTGRES_DB stays "sinwy_test"
config({ path: join(import.meta.dir, "../.env") });

const {
	POSTGRES_USER,
	POSTGRES_PASSWORD,
	POSTGRES_HOST = "localhost",
	POSTGRES_PORT = "5432",
} = process.env;

const serverUrl = `postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}`;

// create the test DB if missing (CREATE DATABASE has no IF NOT EXISTS)
const admin = new SQL(`${serverUrl}/postgres`);
await admin.unsafe("CREATE DATABASE sinwy_test").catch((e) => {
	if (e.errno !== "42P04") throw e; // 42P04 = duplicate_database
});
await admin.close();

// start from an empty schema: leftover rows make drizzle-kit push prompt for
// data-loss confirmation, which it cannot do without a TTY yet still exits 0
const testDb = new SQL(`${serverUrl}/sinwy_test`);
await testDb.unsafe("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
await testDb.close();

// push current schema into the test DB
const push = Bun.spawnSync(["bun", "x", "drizzle-kit", "push", "--force"], {
	cwd: join(import.meta.dir, ".."),
	env: process.env,
	stdout: "inherit",
	stderr: "inherit",
});
if (push.exitCode !== 0) throw new Error("drizzle-kit push failed");
