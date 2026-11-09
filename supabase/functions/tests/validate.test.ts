import { assertEquals, assertThrows } from "@std/assert";
import { z } from "zod";

import { AppError } from "../_shared/errors.ts";
import { validateBody, validateQuery } from "../_shared/validate.ts";

const schema = z.object({ name: z.string().min(1) });

function jsonRequest(body: string): Request {
  return new Request("http://localhost/test", {
    method: "POST",
    body,
    headers: { "content-type": "application/json" },
  });
}

Deno.test("validateBody parses a valid body", async () => {
  const value = await validateBody(jsonRequest('{"name":"XClub"}'), schema);
  assertEquals(value, { name: "XClub" });
});

Deno.test("validateBody rejects malformed JSON with a validation error", async () => {
  const thrown = await validateBody(jsonRequest("{oops"), schema).catch((error) => error);
  assertEquals(thrown instanceof AppError, true);
  assertEquals((thrown as AppError).code, "validation");
});

Deno.test("validateBody surfaces Zod errors for invalid fields", async () => {
  const thrown = await validateBody(jsonRequest('{"name":""}'), schema).catch((error) => error);
  assertEquals(thrown instanceof z.ZodError, true);
});

Deno.test("validateQuery parses and coerces query values", () => {
  const querySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    role: z.enum(["admin", "customer"]).optional(),
  });
  const request = new Request("http://localhost/list?page=3&role=admin");
  assertEquals(validateQuery(request, querySchema), { page: 3, role: "admin" });
});

Deno.test("validateQuery rejects invalid values", () => {
  const querySchema = z.object({ page: z.coerce.number().int().min(1) });
  const request = new Request("http://localhost/list?page=0");
  assertThrows(() => validateQuery(request, querySchema), z.ZodError);
});
