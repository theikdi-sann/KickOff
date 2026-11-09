import { AppError, toApiError } from "./errors.ts";

const DEFAULT_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"];
const ALLOWED_METHODS = "GET, POST, PATCH, DELETE, OPTIONS";
const ALLOWED_HEADERS = "authorization, apikey, content-type, x-request-id";

/** CORS allowlist from env (comma separated) with sensible local defaults. */
export function allowedOrigins(): string[] {
  const configured = Deno.env.get("ALLOWED_ORIGINS");
  const adminUrl = Deno.env.get("ADMIN_APP_URL");
  const origins = (configured ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (adminUrl) origins.push(adminUrl.replace(/\/$/, ""));
  return origins.length > 0 ? [...new Set(origins)] : DEFAULT_ORIGINS;
}

export function requestId(request: Request): string {
  const incoming = request.headers.get("x-request-id");
  return incoming && incoming.length > 0 ? incoming : crypto.randomUUID();
}

export function corsHeaders(request: Request): Headers {
  const headers = new Headers({
    "access-control-allow-methods": ALLOWED_METHODS,
    "access-control-allow-headers": ALLOWED_HEADERS,
    "access-control-max-age": "600",
    vary: "origin",
  });

  const origin = request.headers.get("origin");
  if (origin && allowedOrigins().includes(origin)) {
    headers.set("access-control-allow-origin", origin);
  }
  return headers;
}

function baseHeaders(request: Request): Headers {
  const headers = corsHeaders(request);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  headers.set("x-request-id", requestId(request));
  return headers;
}

/** `{ ok: true, data }` envelope. */
export function ok<T>(data: T, request: Request, status = 200): Response {
  return new Response(JSON.stringify({ ok: true, data }), { status, headers: baseHeaders(request) });
}

/** `{ ok: false, error }` envelope with the mapped HTTP status. */
export function fail(thrown: unknown, request: Request): Response {
  const id = requestId(request);
  const { status, error } = toApiError(thrown, id);
  return new Response(JSON.stringify({ ok: false, error }), { status, headers: baseHeaders(request) });
}

/** Throws a 405 AppError unless the method is allowed. */
export function guardMethod(request: Request, allowed: readonly string[]): void {
  if (request.method === "OPTIONS") return;
  if (!allowed.includes(request.method)) {
    throw new AppError("validation", "Method not allowed", {
      status: 405,
      details: { allowed },
    });
  }
}

export function handlePreflight(request: Request): Response | null {
  if (request.method !== "OPTIONS") return null;
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

/** Wraps a handler with preflight, method guard, envelopes and error mapping. */
export function serveJson(
  handler: (request: Request) => Promise<Response>,
  allowed: readonly string[] = ["GET", "POST"],
): (request: Request) => Promise<Response> {
  return async (request) => {
    const preflight = handlePreflight(request);
    if (preflight) return preflight;
    try {
      guardMethod(request, allowed);
      return await handler(request);
    } catch (error) {
      return fail(error, request);
    }
  };
}
