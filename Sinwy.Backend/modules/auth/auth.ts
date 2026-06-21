import db from "@db";
import { betterAuth } from "better-auth";
// import db from "./../../db"; // Better auth doesn't support aliases
import { drizzleAdapter } from "better-auth/adapters/drizzle";

export const auth = betterAuth({
	database: drizzleAdapter(db, {
		provider: "pg",
	}),
	emailAndPassword: {
		enabled: true,
	},
});
