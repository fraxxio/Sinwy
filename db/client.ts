import appConfig from "@config";
import { drizzle } from "drizzle-orm/bun-sql";

export default drizzle(appConfig.DB_URL);
