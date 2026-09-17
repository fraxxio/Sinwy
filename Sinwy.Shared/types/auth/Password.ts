import { z } from "zod";

export const PASSWORD_RULES =
	"At least 10 characters, including one number and one symbol.";

// 128 mirrors better-auth's maxPasswordLength, which rejects server-side otherwise
export const passwordSchema = z
	.string()
	.regex(/^(?=.*\d)(?=.*[^\p{L}\d])[^\s]{10,}$/u, PASSWORD_RULES)
	.max(128, "Password must be at most 128 characters");
