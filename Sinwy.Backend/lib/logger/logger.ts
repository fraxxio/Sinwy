import appConfig from "@config";
import { consoleTransport } from "./consoleTransport";
import type { LogContext, Logger, LogLevel, LogTransport } from "./loggerTypes";

// keyed by LOG_DRIVER so adding a driver in appConfig fails here until it has a transport
const transports = {
	console: consoleTransport,
} satisfies Record<(typeof appConfig)["LOG_DRIVER"], LogTransport>;

const severity: Record<LogLevel, number> = {
	debug: 10,
	info: 20,
	warn: 30,
	error: 40,
};

const transport = transports[appConfig.LOG_DRIVER];
const minimumSeverity = severity[appConfig.LOG_LEVEL];

const write =
	(level: LogLevel, scope?: string) =>
	(message: string, context?: LogContext) => {
		if (severity[level] < minimumSeverity) return;
		transport.write({ level, message, scope, context, timestamp: new Date() });
	};

/**
 * Creates a logger scoped to a module or subsystem, e.g `createLogger("auth")` tags
 * its entries with `[auth]`. Where entries end up is decided by LOG_DRIVER, never
 * by the caller. Use the exported `logger` when no scope is needed.
 */
export const createLogger = (scope?: string): Logger => ({
	debug: write("debug", scope),
	info: write("info", scope),
	warn: write("warn", scope),
	error: write("error", scope),
	child: (childScope) =>
		createLogger(scope ? `${scope}:${childScope}` : childScope),
});

export const logger = createLogger();
