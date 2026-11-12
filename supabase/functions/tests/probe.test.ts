import { assertEquals } from "@std/assert";

import { probeDepth } from "../_shared/probe.ts";

const TOKEN = "kickoff-metrics-token-value";

Deno.test("an anonymous probe is shallow", () => {
  assertEquals(probeDepth(null, TOKEN), "shallow");
  assertEquals(probeDepth("", TOKEN), "shallow");
});

Deno.test("a wrong token is shallow", () => {
  assertEquals(probeDepth("wrong-token", TOKEN), "shallow");
  assertEquals(probeDepth(`${TOKEN}x`, TOKEN), "shallow");
});

Deno.test("the metrics token unlocks the deep checks", () => {
  assertEquals(probeDepth(TOKEN, TOKEN), "deep");
});
