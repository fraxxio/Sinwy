import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { z } from "zod";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: join(__dirname, "../.env") });

const configSchema = z.object({
	NODE_ENV: z.enum(["dev", "local", "prod"]),
	PORT: z.coerce.number().default(3000),
	DB_URL: z.url(),
});

export default configSchema.parse(process.env);
