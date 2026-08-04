import type { LogEntry, LogLevel, LogTransport } from "./loggerTypes";

const consoleMethods: Record<LogLevel, (...args: unknown[]) => void> = {
	debug: (...args) => console.debug(...args),
	info: (...args) => console.info(...args),
	warn: (...args) => console.warn(...args),
	error: (...args) => console.error(...args),
};

const buildPrefix = ({ level, scope, timestamp }: LogEntry): string =>
	`${timestamp.toISOString()} ${level.toUpperCase()}${scope ? ` [${scope}]` : ""}`;

export const consoleTransport: LogTransport = {
	write(entry) {
		const args: unknown[] = [buildPrefix(entry), entry.message];
		if (entry.context) args.push(entry.context);
		consoleMethods[entry.level](...args);
	},
};
