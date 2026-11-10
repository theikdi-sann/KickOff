import { assertEquals } from "@std/assert";

import {
  base64UrlDecode,
  base64UrlEncode,
  constantTimeEqual,
  signHmac,
  verifyHmac,
} from "../_shared/hmac.ts";

const SECRET = "kickoff-test-secret-that-is-long-enough";
const PAYLOAD = "v2|tkt-1|m-bkk|ord-1|nonce-abc";

Deno.test("signHmac is deterministic and base64url-safe", async () => {
  const first = await signHmac(PAYLOAD, SECRET);
  const second = await signHmac(PAYLOAD, SECRET);
  assertEquals(first, second);
  assertEquals(/^[A-Za-z0-9_-]+$/.test(first), true);
  assertEquals(first.includes("="), false);
});

Deno.test("verifyHmac accepts the matching signature", async () => {
  const signature = await signHmac(PAYLOAD, SECRET);
  assertEquals(await verifyHmac(PAYLOAD, SECRET, signature), true);
});

Deno.test("verifyHmac rejects a tampered payload", async () => {
  const signature = await signHmac(PAYLOAD, SECRET);
  assertEquals(await verifyHmac(`${PAYLOAD}-tampered`, SECRET, signature), false);
});

Deno.test("verifyHmac rejects a tampered signature", async () => {
  const signature = await signHmac(PAYLOAD, SECRET);
  const chars = signature.split("");
  chars[0] = chars[0] === "A" ? "B" : "A";
  assertEquals(await verifyHmac(PAYLOAD, SECRET, chars.join("")), false);
});

Deno.test("verifyHmac rejects a different secret", async () => {
  const signature = await signHmac(PAYLOAD, SECRET);
  assertEquals(await verifyHmac(PAYLOAD, `${SECRET}-other`, signature), false);
});

Deno.test("verifyHmac rejects malformed base64url", async () => {
  assertEquals(await verifyHmac(PAYLOAD, SECRET, "not*valid*base64"), false);
});

Deno.test("constantTimeEqual compares strings", () => {
  assertEquals(constantTimeEqual("abc", "abc"), true);
  assertEquals(constantTimeEqual("abc", "abd"), false);
  assertEquals(constantTimeEqual("abc", "abcd"), false);
  assertEquals(constantTimeEqual("", ""), true);
});

Deno.test("base64url round-trips arbitrary bytes", () => {
  const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]);
  const encoded = base64UrlEncode(bytes);
  assertEquals(base64UrlDecode(encoded), bytes);
});
