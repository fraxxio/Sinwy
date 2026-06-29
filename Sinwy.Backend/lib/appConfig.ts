import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { z } from "zod";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: join(__dirname, "../.env") });

const configSchema = z
	.object({
		NODE_ENV: z.enum(["dev", "local", "prod"]),
		PORT: z.coerce.number().default(3000),
		BETTER_AUTH_SECRET: z.string(),
		BETTER_AUTH_URL: z.string(),
		GOOGLE_CLIENT_ID: z.string(),
		GOOGLE_CLIENT_SECRET: z.string(),
		RESEND_API_KEY: z.string(),
		RESEND_FROM_EMAIL: z.string(),
		POSTGRES_USER: z.string(),
		POSTGRES_PASSWORD: z.string(),
		POSTGRES_DB: z.string(),
		POSTGRES_HOST: z.string().default("localhost"),
		POSTGRES_PORT: z.coerce.number().default(5432),
	})
	.transform((env) => {
		const DB_URL =
			`postgresql://${env.POSTGRES_USER}:${env.POSTGRES_PASSWORD}` +
			`@${env.POSTGRES_HOST}:${env.POSTGRES_PORT}/${env.POSTGRES_DB}`;

		return {
			...env,
			DB_URL,
		};
	});

export default configSchema.parse(process.env);
