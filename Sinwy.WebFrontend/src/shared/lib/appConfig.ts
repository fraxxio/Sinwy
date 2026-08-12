import { config } from "dotenv";
import { z } from "zod";

config({ path: [".env.local", ".env"] });

const configSchema = z.object({
	BETTER_AUTH_URL: z.string(),
	BETTER_AUTH_SECRET: z.string(),
	BACKEND_URL: z.url().default("http://localhost:3001"),
});

export default configSchema.parse(process.env);
