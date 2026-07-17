import { join } from "node:path";
import { SQL } from "bun";
import { config } from "dotenv";

// Force the test database BEFORE any app module loads appConfig —
// integration tests truncate tables and must never touch the dev DB.
process.env["POSTGRES_DB"] = "sinwy_test";

// dotenv never overrides already-set vars, so POSTGRES_DB stays "sinwy_test"
config({ path: join(import.meta.dir, "../.env") });

const {
	POSTGRES_USER,
	POSTGRES_PASSWORD,
	POSTGRES_HOST = "localhost",
	POSTGRES_PORT = "5432",
} = process.env;

// create the test DB if missing (CREATE DATABASE has no IF NOT EXISTS)
const admin = new SQL(
	`postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/postgres`,
);
await admin.unsafe("CREATE DATABASE sinwy_test").catch((e) => {
	if (e.errno !== "42P04") throw e; // 42P04 = duplicate_database
});
await admin.close();

// push current schema into the test DB
const push = Bun.spawnSync(["bun", "x", "drizzle-kit", "push", "--force"], {
	cwd: join(import.meta.dir, ".."),
	env: process.env,
	stdout: "inherit",
	stderr: "inherit",
});
if (push.exitCode !== 0) throw new Error("drizzle-kit push failed");
