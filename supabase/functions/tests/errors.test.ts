import { assertEquals } from "@std/assert";
import { z } from "zod";

import { AppError, toApiError } from "../_shared/errors.ts";

Deno.test("maps AppError to its status and code", () => {
  const mapped = toApiError(new AppError("forbidden", "nope"));
  assertEquals(mapped.status, 403);
  assertEquals(mapped.error.code, "forbidden");
  assertEquals(mapped.error.message, "nope");
});

Deno.test("honours a custom status (405 method guard)", () => {
  const mapped = toApiError(new AppError("validation", "Method not allowed", { status: 405 }));
  assertEquals(mapped.status, 405);
  assertEquals(mapped.error.code, "validation");
});

Deno.test("maps Zod errors to 422 with field details", () => {
  const parsed = z.object({ email: z.email() }).safeParse({ email: "nope" });
  if (parsed.success) throw new Error("expected failure");
  const mapped = toApiError(parsed.error, "req-1");
  assertEquals(mapped.status, 422);
  assertEquals(mapped.error.code, "validation");
  assertEquals(Array.isArray(mapped.error.details), true);
  assertEquals(mapped.error.requestId, "req-1");
});

Deno.test("maps Postgres unique violations to conflict", () => {
  const mapped = toApiError({ code: "23505", message: "duplicate key" });
  assertEquals(mapped.status, 409);
  assertEquals(mapped.error.code, "conflict");
  assertEquals(mapped.error.message, "duplicate key");
});

Deno.test("maps unknown Postgres codes to a generic internal error", () => {
  const mapped = toApiError({ code: "XX000", message: "secret internals" });
  assertEquals(mapped.status, 500);
  assertEquals(mapped.error.message, "Database request failed");
});

Deno.test("maps Stripe card errors to 402", () => {
  const mapped = toApiError({ type: "StripeCardError", message: "card declined" });
  assertEquals(mapped.status, 402);
  assertEquals(mapped.error.code, "payment_required");
});

Deno.test("hides unknown errors", () => {
  const mapped = toApiError(new Error("connection string leaked"));
  assertEquals(mapped.status, 500);
  assertEquals(mapped.error.code, "internal");
  assertEquals(mapped.error.message, "Internal server error");
});
