import { assert, assertEquals } from "@std/assert";

import {
  CLUB_SLUG_PATTERN,
  PLATFORM_CLAIM_KEY,
  isPlatformMetadata,
  isValidClubSlug,
  planBootstrapClaim,
} from "../_shared/platform.ts";

// The deployed copy of the platform vocabulary (C9.2): the white-label
// `bootstrap` validates the app's slug with the same pattern the database
// stores, and every Edge guard reads the same claim key the console does.

Deno.test("the platform claim key is the one 0054 writes", () => {
  assertEquals(PLATFORM_CLAIM_KEY, "platform");
  assertEquals(isPlatformMetadata({ platform: true }), true);
  assertEquals(isPlatformMetadata({ role: "admin" }), false);
  assertEquals(isPlatformMetadata(null), false);
});

Deno.test("the club slug pattern is the tenants table's own (0040)", () => {
  assertEquals(CLUB_SLUG_PATTERN.source, "^[a-z0-9]+(-[a-z0-9]+)*$");
  assertEquals(isValidClubSlug("south-london-fc"), true);
  assertEquals(isValidClubSlug("Kick Off"), false);
  assertEquals(isValidClubSlug("a--b"), false);
  assertEquals(isValidClubSlug(""), false);
  assertEquals(isValidClubSlug(undefined), false);
});

Deno.test("the bootstrap claim names the club the session is bound to", () => {
  const claim = planBootstrapClaim("00000000-0000-0000-0000-000000000001");
  assertEquals(claim, { tenant_id: "00000000-0000-0000-0000-000000000001" });

  assert(
    (() => {
      try {
        planBootstrapClaim("not-a-uuid");
        return false;
      } catch (error) {
        return error instanceof RangeError;
      }
    })(),
    "a non-uuid tenant id is refused before it reaches a claim",
  );
});
