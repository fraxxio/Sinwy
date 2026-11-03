import { customType } from "drizzle-orm/pg-core";

/** Drizzle's own `jsonb` stringifies the value and Bun SQL encodes that string again, storing a JSON string; Bun encodes objects itself. */
export const jsonb = <T>(name: string) =>
	customType<{ data: T; driverData: T }>({ dataType: () => "jsonb" })(name);
