import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { z } from "zod";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: join(__dirname, "../.env") });

const configSchema = z
	.object({
		NODE_ENV: z.enum(["dev", "local", "prod", "test"]),
		PORT: z.coerce.number().default(3001),
		LOG_DRIVER: z.enum(["console"]).default("console"),
		LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
		BETTER_AUTH_SECRET: z.string(),
		BETTER_AUTH_URL: z.string(),
		GOOGLE_CLIENT_ID: z.string(),
		GOOGLE_CLIENT_SECRET: z.string(),
		EMAIL_DRIVER: z.enum(["resend", "console"]).optional(),
		RESEND_API_KEY: z.string().optional(),
		RESEND_EMAIL_DOMAIN: z.string(),
		POLAR_ACCESS_TOKEN: z.string(),
		POLAR_WEBHOOK_SECRET: z.string(),
		POLAR_SERVER: z.enum(["sandbox", "production"]).default("sandbox"),
		POLAR_PRODUCT_STARTER: z.string(),
		POLAR_PRODUCT_PROFESSIONAL: z.string(),
		POLAR_PRODUCT_ENTERPRISE: z.string(),
		POSTGRES_USER: z.string(),
		POSTGRES_PASSWORD: z.string(),
		POSTGRES_DB: z.string(),
		POSTGRES_HOST: z.string().default("localhost"),
		POSTGRES_PORT: z.coerce.number().default(5432),
	})
	.transform((env, ctx) => {
		const EMAIL_DRIVER =
			env.EMAIL_DRIVER ??
			(env.NODE_ENV === "local" || env.NODE_ENV === "test"
				? "console"
				: "resend");

		if (EMAIL_DRIVER === "resend" && !env.RESEND_API_KEY) {
			ctx.addIssue({
				code: "custom",
				path: ["RESEND_API_KEY"],
				message: 'RESEND_API_KEY is required when EMAIL_DRIVER is "resend"',
			});
		}

		const DB_URL =
			`postgresql://${env.POSTGRES_USER}:${env.POSTGRES_PASSWORD}` +
			`@${env.POSTGRES_HOST}:${env.POSTGRES_PORT}/${env.POSTGRES_DB}`;

		return {
			...env,
			EMAIL_DRIVER,
			DB_URL,
		};
	});

export default configSchema.parse(process.env);
