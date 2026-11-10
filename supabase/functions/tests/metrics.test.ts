import { assertEquals } from "@std/assert";

import { countHoldConflicts, failedScans, metricsTokenMatches } from "../_shared/metrics.ts";

Deno.test("metrics token must match exactly", () => {
  assertEquals(metricsTokenMatches("s3cret-token-value", "s3cret-token-value"), true);
  assertEquals(metricsTokenMatches("s3cret-token-valuE", "s3cret-token-value"), false);
  assertEquals(metricsTokenMatches("s3cret-token-value ", "s3cret-token-value"), false);
  assertEquals(metricsTokenMatches(null, "s3cret-token-value"), false);
  assertEquals(metricsTokenMatches("anything", ""), false);
});

Deno.test("hold conflicts count seats reserved more than once in the window", () => {
  assertEquals(countHoldConflicts([]), 0);
  assertEquals(countHoldConflicts(["seat-1", "seat-2"]), 0);
  assertEquals(countHoldConflicts(["seat-1", "seat-1", "seat-2"]), 1);
  assertEquals(
    countHoldConflicts(["a", "a", "b", "b", "b", "c"]),
    2,
    "only seats with a second reservation are conflicts",
  );
});

Deno.test("failed scans aggregate invalid and wrong-fixture results", () => {
  assertEquals(failedScans({ invalid: 3, wrongMatch: 2 }), 5);
  assertEquals(failedScans({ invalid: 0, wrongMatch: 0 }), 0);
});
