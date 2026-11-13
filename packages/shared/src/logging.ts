/**
 * The one logging convention.
 *
 * Every layer emits through this module: the staff console and the supporter
 * app call `createLogger('<scope>')`, and the deployed Edge Functions receive
 * a **generated copy** of this file (`supabase/functions/_shared/logger.ts`,
 * produced by `scripts/sync-edge-schemas.mjs` — they cannot import
 * `@kickoff/shared` at deploy time, and a hand-written copy would drift).
 *
 * Rules this module enforces by construction:
 *   * one JSON line per event — `level`, `message`, `time`, an optional
 *     `scope`, then the caller's context; a log line is data, not prose;
 *   * every value passes the redactor, so a secret in a context object is
 *     `[redacted]` before it can reach a log drain;
 *   * `Error` values serialise to `{ name, message, stack }` — plain
 *     `JSON.stringify(new Error('x'))` is `{}`, which is how failures become
 *     invisible;
 *   * recursion is capped, so a cyclic structure cannot hang the emitter.
 *
 * This file must stay **import-free**: the generated Edge copy has to resolve
 * under Deno's module rules (contract: `scripts/tests/logging.test.mjs`).
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * The emit transport. `console` is a global in every runtime this code runs
 * in (Node, browsers, React Native, Deno); the shared library compiles
 * against a pure ES `lib`, so the surface is declared here module-locally
 * instead of dragging the whole DOM type surface into every consumer.
 */
declare const console: {
  log(message: unknown): void;
  warn(message: unknown): void;
  error(message: unknown): void;
};

const REDACTED = '[redacted]';

/** How deep the redactor walks before it gives up on a subtree. */
const MAX_DEPTH = 6;

/** Keys whose values never reach a log line (matched case-insensitively). */
const SECRET_KEYS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'password',
  'newpassword',
  'currentpassword',
  'sig',
  'service_role',
  'service_role_key',
  'apikey',
  'stripe_secret_key',
  'ticket_hmac_key',
  'secret',
  'token',
]);

function shouldRedact(key: string): boolean {
  return SECRET_KEYS.has(key.toLowerCase());
}

function serialise(value: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH) return '[max-depth]';
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => serialise(item, depth + 1));

  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    output[key] = shouldRedact(key) ? REDACTED : serialise(item, depth + 1);
  }
  return output;
}

/** The redactor: secret keys masked, Errors readable, depth capped. */
export function redact(context: Record<string, unknown>): Record<string, unknown> {
  return serialise(context, 0) as Record<string, unknown>;
}

/** A scoped emitter. Every call writes exactly one JSON line. */
export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

function emit(
  level: LogLevel,
  scope: string | undefined,
  message: string,
  context: Record<string, unknown> = {},
): void {
  const entry = {
    level,
    message,
    time: new Date().toISOString(),
    ...(scope !== undefined ? { scope } : {}),
    ...redact(context),
  };
  const line = JSON.stringify(entry);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

function buildLogger(scope: string | undefined): Logger {
  return {
    debug: (message, context) => emit('debug', scope, message, context),
    info: (message, context) => emit('info', scope, message, context),
    warn: (message, context) => emit('warn', scope, message, context),
    error: (message, context) => emit('error', scope, message, context),
  };
}

/** Creates a logger whose lines carry `scope`, e.g. `admin.audit`. */
export function createLogger(scope: string): Logger {
  return buildLogger(scope);
}

/**
 * The scope-less default — the exact shape the deployed Edge Functions have
 * always emitted, so existing log consumers see no change.
 */
export const logger: Logger = buildLogger(undefined);
