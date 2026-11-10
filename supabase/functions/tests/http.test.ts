import { assertEquals, assertExists } from "@std/assert";
import { z } from "zod";

import { AppError } from "../_shared/errors.ts";
import {
  corsHeaders,
  fail,
  guardMethod,
  handlePreflight,
  ok,
  requestId,
  serveJson,
} from "../_shared/http.ts";

function request(path = "/test", init: RequestInit = {}): Request {
  return new Request(`http://localhost${path}`, init);
}

Deno.test("ok() wraps data in the success envelope", async () => {
  const response = ok({ hello: "world" }, request());
  assertEquals(response.status, 200);
  assertEquals(await response.json(), { ok: true, data: { hello: "world" } });
  assertEquals(response.headers.get("cache-control"), "no-store");
});

Deno.test("ok() echoes an allowlisted Origin", () => {
  const response = ok({}, request("/", { headers: { origin: "http://localhost:3000" } }));
  assertEquals(response.headers.get("access-control-allow-origin"), "http://localhost:3000");
});

Deno.test("corsHeaders() omits unknown origins", () => {
  const headers = corsHeaders(request("/", { headers: { origin: "https://evil.example" } }));
  assertEquals(headers.get("access-control-allow-origin"), null);
  assertEquals(headers.get("vary"), "origin");
});

Deno.test("requestId() reuses the incoming header", () => {
  assertEquals(requestId(request("/", { headers: { "x-request-id": "req-123" } })), "req-123");
  assertExists(requestId(request()));
});

Deno.test("fail() maps AppError to its status and code", async () => {
  const response = fail(new AppError("forbidden", "nope"), request());
  assertEquals(response.status, 403);
  const body = await response.json();
  assertEquals(body.ok, false);
  assertEquals(body.error.code, "forbidden");
  assertEquals(body.error.message, "nope");
  assertExists(body.error.requestId);
});

Deno.test("fail() maps validation errors with details", async () => {
  const parsed = z.object({ email: z.email() }).safeParse({ email: "nope" });
  if (parsed.success) throw new Error("expected failure");

  const response = fail(parsed.error, request());
  assertEquals(response.status, 422);
  const body = await response.json();
  assertEquals(body.error.code, "validation");
  assertEquals(Array.isArray(body.error.details), true);
});

Deno.test("fail() hides unknown errors", async () => {
  const response = fail(new Error("database password hunter2"), request());
  assertEquals(response.status, 500);
  const body = await response.json();
  assertEquals(body.error.message, "Internal server error");
});

Deno.test("guardMethod() rejects disallowed methods with 405", () => {
  try {
    guardMethod(request("/", { method: "POST" }), ["GET"]);
    throw new Error("expected guardMethod to throw");
  } catch (error) {
    const response = fail(error, request());
    assertEquals(response.status, 405);
  }
});

Deno.test("corsHeaders() allows every header the Supabase SDK sends", () => {
  const headers = corsHeaders(request("/", { headers: { origin: "http://localhost:3000" } }));
  const allowed = (headers.get("access-control-allow-headers") ?? "")
    .split(",")
    .map((header) => header.trim().toLowerCase());

  // supabase-js sends x-client-info on every function call; missing it makes the
  // browser fail the CORS preflight before the request ever leaves the page.
  for (const header of [
    "authorization",
    "apikey",
    "content-type",
    "x-client-info",
    "x-retry-count",
    "traceparent",
    "tracestate",
    "baggage",
  ]) {
    assertEquals(allowed.includes(header), true, `${header} must be allowed`);
  }
});

Deno.test("handlePreflight() answers OPTIONS with 204 + CORS", () => {
  const response = handlePreflight(
    request("/", { method: "OPTIONS", headers: { origin: "http://localhost:3000" } }),
  );
  assertExists(response);
  assertEquals(response.status, 204);
  assertEquals(response.headers.get("access-control-allow-origin"), "http://localhost:3000");
});

Deno.test("serveJson() catches thrown errors into the envelope", async () => {
  const wrapped = serveJson(() => {
    return Promise.reject(new AppError("not_found", "missing"));
  }, ["GET"]);
  const response = await wrapped(request("/", { method: "GET" }));
  assertEquals(response.status, 404);
  const body = await response.json();
  assertEquals(body.ok, false);
  assertEquals(body.error.code, "not_found");
});
