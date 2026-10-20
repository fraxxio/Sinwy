import { dirname, join, resolve } from "node:path";
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
		STORAGE_DRIVER: z.enum(["local"]).default("local"),
		STORAGE_LOCAL_DIR: z.string().default(".storage"),
		BETTER_AUTH_SECRET: z.string(),
		BETTER_AUTH_URL: z.string(),
		WEB_APP_URL: z.url(),
		GOOGLE_CLIENT_ID: z.string(),
		GOOGLE_CLIENT_SECRET: z.string(),
		EMAIL_DRIVER: z.enum(["resend", "console"]).optional(),
		EMAIL_OUTBOX_DIR: z.string().default(".emails"),
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
		// dev:seed-scenario sends to plus-aliases of this address; Polar rejects domains without mail
		SEED_EMAIL_BASE: z.email().or(z.literal("")).optional(),
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

		if (env.POLAR_SERVER === "production" && env.NODE_ENV !== "prod") {
			ctx.addIssue({
				code: "custom",
				path: ["POLAR_SERVER"],
				message: 'POLAR_SERVER "production" requires NODE_ENV "prod"',
			});
		}

		const DB_URL =
			`postgresql://${env.POSTGRES_USER}:${env.POSTGRES_PASSWORD}` +
			`@${env.POSTGRES_HOST}:${env.POSTGRES_PORT}/${env.POSTGRES_DB}`;

		return {
			...env,
			EMAIL_DRIVER,
			DB_URL,
			// relative paths resolve against the backend root, not the process cwd
			STORAGE_LOCAL_DIR: resolve(__dirname, "..", env.STORAGE_LOCAL_DIR),
			EMAIL_OUTBOX_DIR: resolve(__dirname, "..", env.EMAIL_OUTBOX_DIR),
		};
	});

export default configSchema.parse(process.env);
