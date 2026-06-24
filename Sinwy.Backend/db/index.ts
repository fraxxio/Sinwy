// import appConfig from "../lib/appConfig.ts"; // Better auth doesn't support aliases
import appConfig from "@config";
import { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";

const client = new SQL(appConfig.DB_URL);

export default drizzle(client);
