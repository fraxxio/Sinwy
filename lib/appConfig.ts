import { z } from "zod";

const configSchema = z.object({
	NODE_ENV: z.enum(["dev", "local", "prod"]),
	PORT: z.coerce.number().default(3000),
	DB_URL: z.url(),
});

export default configSchema.parse(process.env);
