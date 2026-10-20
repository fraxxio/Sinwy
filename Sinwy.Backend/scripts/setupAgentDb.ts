import { randomBytes } from "node:crypto";
import { chmod, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import appConfig from "@config";
import { SQL } from "bun";
import { assertLocalDev } from "./assertLocalDev";

const agentRoles = [
	{
		service: "sinwy_ro",
		role: "sinwy_agent_ro",
		privileges: "SELECT",
		readOnly: true,
		statementTimeout: "5s",
	},
	{
		service: "sinwy_rw",
		role: "sinwy_agent_rw",
		privileges: "SELECT, INSERT, UPDATE, DELETE",
		readOnly: false,
		statementTimeout: "15s",
	},
] as const;

const serviceFilePath = join(homedir(), ".pg_service.conf");
const passFilePath = join(homedir(), ".pgpass");

assertLocalDev("set up agent DB roles");

const quoteIdent = (name: string) => `"${name.replaceAll('"', '""')}"`;

const readTextFile = async (path: string) => {
	const file = Bun.file(path);
	return (await file.exists()) ? await file.text() : "";
};

const withoutSections = (content: string, names: string[]) => {
	let skipping = false;
	return content
		.split("\n")
		.filter((line) => {
			const header = line.match(/^\s*\[(.+)\]\s*$/);
			if (header?.[1] !== undefined) {
				skipping = names.includes(header[1]);
			}
			return !skipping;
		})
		.join("\n")
		.trim();
};

const withoutPassEntries = (content: string, users: string[]) =>
	content
		.split("\n")
		.filter((line) => {
			const [host, port, database, user] = line.split(":");
			return !(
				host === appConfig.POSTGRES_HOST &&
				port === String(appConfig.POSTGRES_PORT) &&
				database === appConfig.POSTGRES_DB &&
				user !== undefined &&
				users.includes(user)
			);
		})
		.join("\n")
		.trim();

const joinBlocks = (separator: string, blocks: string[]) =>
	`${blocks.filter(Boolean).join(separator)}\n`;

const sql = new SQL(appConfig.DB_URL);
const database = quoteIdent(appConfig.POSTGRES_DB);
const owner = quoteIdent(appConfig.POSTGRES_USER);
const passEntries: string[] = [];

for (const { role, privileges, readOnly, statementTimeout } of agentRoles) {
	const password = randomBytes(24).toString("hex");
	passEntries.push(
		`${appConfig.POSTGRES_HOST}:${appConfig.POSTGRES_PORT}:${appConfig.POSTGRES_DB}:${role}:${password}`,
	);

	const [existing] = await sql`select 1 from pg_roles where rolname = ${role}`;
	const roleAction = existing ? "ALTER" : "CREATE";

	await sql.unsafe(`${roleAction} ROLE ${role} LOGIN PASSWORD '${password}'`);
	await sql.unsafe(
		`ALTER ROLE ${role} SET default_transaction_read_only = ${readOnly ? "on" : "off"}`,
	);
	await sql.unsafe(
		`ALTER ROLE ${role} SET statement_timeout = '${statementTimeout}'`,
	);
	await sql.unsafe(
		`ALTER ROLE ${role} SET idle_in_transaction_session_timeout = '30s'`,
	);
	await sql.unsafe(`GRANT CONNECT ON DATABASE ${database} TO ${role}`);
	await sql.unsafe(`GRANT USAGE ON SCHEMA public TO ${role}`);
	await sql.unsafe(
		`GRANT ${privileges} ON ALL TABLES IN SCHEMA public TO ${role}`,
	);
	await sql.unsafe(
		`ALTER DEFAULT PRIVILEGES FOR ROLE ${owner} IN SCHEMA public GRANT ${privileges} ON TABLES TO ${role}`,
	);
}

await sql.close();

const serviceNames = agentRoles.map(({ service }) => service);
const roleNames = agentRoles.map(({ role }) => role);

const serviceSections = agentRoles.map(({ service, role }) =>
	[
		`[${service}]`,
		`host=${appConfig.POSTGRES_HOST}`,
		`port=${appConfig.POSTGRES_PORT}`,
		`dbname=${appConfig.POSTGRES_DB}`,
		`user=${role}`,
	].join("\n"),
);

await writeFile(
	serviceFilePath,
	joinBlocks("\n\n", [
		withoutSections(await readTextFile(serviceFilePath), serviceNames),
		...serviceSections,
	]),
);

await writeFile(
	passFilePath,
	joinBlocks("\n", [
		withoutPassEntries(await readTextFile(passFilePath), roleNames),
		...passEntries,
	]),
	{ mode: 0o600 },
);
await chmod(passFilePath, 0o600);

console.log(
	`Agent DB roles ready. Use: ${serviceNames.map((name) => `psql service=${name}`).join(" | ")}`,
);
