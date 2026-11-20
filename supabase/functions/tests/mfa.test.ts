import { assertEquals, assertExists } from "@std/assert";

import { RUN, authAdmin, authPublic, login, requireEnv } from "./_commerce.ts";

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Decode(input: string): Uint8Array {
  const clean = input.replace(/=+$/, "").toUpperCase();
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index === -1) throw new Error(`not base32: ${char}`);
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(bytes);
}

/** RFC 6238 TOTP, SHA-1, 6 digits, 30-second step. */
async function totp(secret: string, now = Date.now()): Promise<string> {
  const counter = Math.floor(now / 1000 / 30);
  const message = new Uint8Array(8);
  let remaining = counter;
  for (let index = 7; index >= 0; index -= 1) {
    message[index] = remaining & 0xff;
    remaining = Math.floor(remaining / 256);
  }
  const keyBytes = base32Decode(secret);
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes.buffer as ArrayBuffer,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, message));
  const byte = (index: number): number => digest[index] ?? 0;
  const offset = byte(19) & 0x0f;
  const binary =
    ((byte(offset) & 0x7f) << 24) |
    ((byte(offset + 1) & 0xff) << 16) |
    ((byte(offset + 2) & 0xff) << 8) |
    (byte(offset + 3) & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

function tokenClaims(token: string): Record<string, unknown> {
  const payload = token.split(".")[1];
  if (!payload) throw new Error("token has no payload");
  return JSON.parse(
    new TextDecoder().decode(
      Uint8Array.from(atob(payload.replaceAll("-", "+").replaceAll("_", "/")), (char) =>
        char.charCodeAt(0),
      ),
    ),
  );
}

Deno.test({
  name: "staff MFA: enrol TOTP, challenge, verify and reach aal2",
  ignore: !RUN,
  fn: async () => {
    const env = requireEnv();
    const email = `mfa+${crypto.randomUUID().slice(0, 8)}@kickoff.test`;
    const password = "mfa-pass-123";

    const created = await authAdmin<{ user?: { id: string }; id?: string }>(env, "users", {
      method: "POST",
      body: {
        email,
        password,
        email_confirm: true,
        app_metadata: { role: "admin" },
        user_metadata: { full_name: "MFA Test Admin" },
      },
    });
    assertEquals(created.status, 200, JSON.stringify(created.body));
    const userId = created.body.user?.id ?? created.body.id;
    assertExists(userId);

    try {
      const token = await login(env, email, password);

      const enrolled = await authPublic<{
        id?: string;
        totp?: { secret?: string };
        secret?: string;
      }>(env, "factors", {
        token,
        body: { factor_type: "totp", friendly_name: "Playwright TOTP" },
      });
      assertEquals(enrolled.status, 200, JSON.stringify(enrolled.body));
      const factorId = enrolled.body.id;
      const secret = enrolled.body.totp?.secret ?? enrolled.body.secret;
      assertExists(factorId);
      assertExists(secret);

      const challenge = await authPublic<{ id?: string }>(env, `factors/${factorId}/challenge`, {
        token,
        body: {},
      });
      assertEquals(challenge.status, 200, JSON.stringify(challenge.body));
      const challengeId = challenge.body.id;
      assertExists(challengeId);

      const verified = await authPublic<{ access_token?: string }>(
        env,
        `factors/${factorId}/verify`,
        { token, body: { challenge_id: challengeId, code: await totp(secret) } },
      );
      assertEquals(verified.status, 200, JSON.stringify(verified.body));
      const aal2 = verified.body.access_token;
      assertExists(aal2);

      assertEquals(tokenClaims(aal2).aal, "aal2", "the verified session is aal2");

      const user = await authPublic<{ id?: string }>(env, "user", { method: "GET", token: aal2 });
      assertEquals(user.status, 200);
      assertEquals(user.body.id, userId);
    } finally {
      await authAdmin(env, `users/${userId}`, { method: "DELETE" });
    }
  },
});
