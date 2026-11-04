// import appConfig from "../lib/appConfig.ts"; // Better auth doesn't support aliases
import appConfig from "@config";
import { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";
import * as schema from "./schema";

const client = new SQL(appConfig.DB_URL);

// schema is required for better-auth's drizzle adapter to resolve models
const db = drizzle(client, { schema });
export default db;

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
