// deno-lint-ignore-file no-console
/**
 * Structured JSON logger. Every value is passed through a redactor so secrets
 * never reach the log drain.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

const REDACTED = "[redacted]";
const SECRET_KEYS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "password",
  "newpassword",
  "currentpassword",
  "sig",
  "service_role",
  "service_role_key",
  "apikey",
  "stripe_secret_key",
  "ticket_hmac_key",
  "secret",
  "token",
]);

function shouldRedact(key: string): boolean {
  return SECRET_KEYS.has(key.toLowerCase());
}

function redactValue(value: unknown, depth: number): unknown {
  if (depth > 6) return "[max-depth]";
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => redactValue(item, depth + 1));

  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    output[key] = shouldRedact(key) ? REDACTED : redactValue(item, depth + 1);
  }
  return output;
}

export function redact(context: Record<string, unknown>): Record<string, unknown> {
  return redactValue(context, 0) as Record<string, unknown>;
}

function emit(level: LogLevel, message: string, context: Record<string, unknown> = {}): void {
  const entry = {
    level,
    message,
    time: new Date().toISOString(),
    ...redact(context),
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => emit("debug", message, context),
  info: (message: string, context?: Record<string, unknown>) => emit("info", message, context),
  warn: (message: string, context?: Record<string, unknown>) => emit("warn", message, context),
  error: (message: string, context?: Record<string, unknown>) => emit("error", message, context),
};
