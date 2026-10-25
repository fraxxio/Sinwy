import { sql } from "drizzle-orm";

/** Check constraint body: `column` holds one of `values`. Built from the shared lists, so renaming a value needs a data migration. */
export const oneOf = (column: string, values: readonly string[]) =>
	sql.raw(`"${column}" IN (${values.map((value) => `'${value}'`).join(", ")})`);
