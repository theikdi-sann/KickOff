import { assert, assertEquals } from "@std/assert";

import { AppError } from "../_shared/errors.ts";
import {
  ALERT_COOLDOWN_MS,
  SERVER_ERROR_STATUS,
  alertText,
  classifyFailure,
  isUnsettled,
  shouldAlert,
  shouldRecord,
} from "../_shared/observability.ts";

// The observability core (C10.1, GAP-04): everything here is pure so the
// decisions that matter — what is an incident, when to alert again, which
// orders need a human — are tested without a network, a clock or a database.

Deno.test("an AppError keeps its code, status and message", () => {
  const classified = classifyFailure(new AppError("conflict", "Seat taken"));
  assertEquals(classified, { code: "conflict", status: 409, message: "Seat taken" });
});

Deno.test("an unknown failure becomes an internal 500 with its message", () => {
  const classified = classifyFailure(new TypeError("cannot read properties of undefined"));
  assertEquals(classified.code, "internal");
  assertEquals(classified.status, SERVER_ERROR_STATUS);
  assertEquals(classified.message, "cannot read properties of undefined");
});

Deno.test("a thrown non-Error still records something readable", () => {
  const classified = classifyFailure("boom");
  assertEquals(classified.code, "internal");
  assertEquals(classified.message, "boom");
});

Deno.test("only 5xx statuses are incidents", () => {
  assertEquals(shouldRecord(SERVER_ERROR_STATUS), true);
  assertEquals(shouldRecord(503), true);
  assertEquals(shouldRecord(499), false);
  assertEquals(shouldRecord(401), false);
  assertEquals(shouldRecord(422), false);
});

Deno.test("the cooldown gates repeats per source and code", () => {
  const lastAlerts = new Map<string, number>();
  const key = "receipt:internal";
  const now = 1_000_000;

  // First sighting alerts and starts the window.
  assertEquals(shouldAlert(lastAlerts, key, now, ALERT_COOLDOWN_MS), true);
  // Inside the window: the row is still recorded, the webhook is not hit.
  assertEquals(shouldAlert(lastAlerts, key, now + 60_000, ALERT_COOLDOWN_MS), false);
  // Another source+code is independent.
  assertEquals(shouldAlert(lastAlerts, "orders:internal", now + 60_000, ALERT_COOLDOWN_MS), true);
  // After the window the same key alerts again — the incident is still live.
  assertEquals(
    shouldAlert(lastAlerts, key, now + ALERT_COOLDOWN_MS + 1, ALERT_COOLDOWN_MS),
    true,
  );
});

Deno.test("the alert text names the source, code, request id and message", () => {
  const text = alertText({
    source: "receipt",
    code: "internal",
    requestId: "req-123",
    message: "database timeout",
  });

  assert(text.includes("receipt"), "the source is named");
  assert(text.includes("internal"), "the code is named");
  assert(text.includes("req-123"), "the request id correlates log, record and alert");
  assert(text.includes("database timeout"), "the message is the reason");
});

Deno.test("the sweep flags a paid session on an order that never settled", () => {
  // The incident: Stripe took the money, the order did not become paid.
  assertEquals(isUnsettled("pending", "paid"), true);
  assertEquals(isUnsettled("cancelled", "paid"), true);
  assertEquals(isUnsettled("failed", "paid"), true);

  // Not incidents: nothing captured, or the order already settled.
  assertEquals(isUnsettled("pending", "unpaid"), false);
  assertEquals(isUnsettled("pending", "no_payment_required"), false);
  assertEquals(isUnsettled("paid", "paid"), false);
  assertEquals(isUnsettled("refunded", "paid"), false);
  assertEquals(isUnsettled("cancelled", "unpaid"), false);
});
