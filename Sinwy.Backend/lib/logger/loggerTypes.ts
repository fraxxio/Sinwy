export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogContext = Record<string, unknown>;

export interface LogEntry {
	level: LogLevel;
	message: string;
	scope?: string | undefined;
	context?: LogContext | undefined;
	timestamp: Date;
}

/** Destination a log entry is written to. Transports never throw. */
export interface LogTransport {
	write(entry: LogEntry): void;
}

export type Logger = {
	[Level in LogLevel]: (message: string, context?: LogContext) => void;
} & {
	child(scope: string): Logger;
};
