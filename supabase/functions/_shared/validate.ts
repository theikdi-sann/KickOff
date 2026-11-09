import { z } from "zod";

import { AppError } from "./errors.ts";

/** Parses and validates a JSON request body. */
export async function validateBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    throw new AppError("validation", "Request body must be valid JSON");
  }
  return schema.parse(payload);
}

/** Validates query-string values (all strings; use z.coerce for numbers). */
export function validateQuery<T>(request: Request, schema: z.ZodType<T>): T {
  const url = new URL(request.url);
  const values: Record<string, string> = {};
  for (const [key, value] of url.searchParams.entries()) {
    values[key] = value;
  }
  return schema.parse(values);
}

/** Validates route/path parameters. */
export function validateParams<T>(params: Record<string, string>, schema: z.ZodType<T>): T {
  return schema.parse(params);
}
