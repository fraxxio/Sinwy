import appConfig from "@config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
	schema: "./db/schema/*",
	out: "./drizzle",
	dialect: "postgresql",
	dbCredentials: {
		url: appConfig.DB_URL,
	},
});
