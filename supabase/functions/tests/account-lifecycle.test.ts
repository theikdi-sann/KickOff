import { assertEquals, assertExists, assert } from "@std/assert";

import {
  RUN,
  authAdmin,
  authPublic,
  issueTicket,
  login,
  mailpitBody,
  requireEnv,
  rest,
  waitForMail,
} from "./_commerce.ts";

type Env = ReturnType<typeof requireEnv>;

function uniqueEmail(label: string): string {
  return `${label}+${crypto.randomUUID().slice(0, 8)}@kickoff.test`;
}

async function createUser(
  env: Env,
  input: { email: string; password: string; confirm?: boolean },
): Promise<string> {
  const created = await authAdmin<{ user?: { id: string }; id?: string }>(env, "users", {
    method: "POST",
    body: {
      email: input.email,
      password: input.password,
      email_confirm: input.confirm ?? true,
      app_metadata: { role: "customer" },
      user_metadata: { full_name: "Lifecycle Test" },
    },
  });
  assertEquals(created.status, 200, JSON.stringify(created.body));
  const id = created.body.user?.id ?? created.body.id;
  assertExists(id);
  return id;
}

Deno.test({
  name: "account lifecycle: reset mail, own profile edit, then erasure with retained finance",
  ignore: !RUN,
  fn: async () => {
    const env = requireEnv();
    const email = uniqueEmail("lifecycle");
    const password = "lifecycle-pass-123";
    const userId = await createUser(env, { email, password });

    const fan = await login(env, email, password);
    const ticket = await issueTicket(env, fan, "m-bkk-north-A10");

    try {
      // The fan can correct their own profile through RLS.
      await rest(env, `profiles?id=eq.${userId}`, {
        token: fan,
        method: "PATCH",
        body: { full_name: "Nara Updated", phone: "089 111 2222" },
        prefer: "return=minimal",
      });
      const [profile] = await rest<Array<{ full_name: string; phone: string | null }>>(
        env,
        `profiles?id=eq.${userId}&select=full_name,phone`,
        { token: fan },
      );
      assertEquals(profile?.full_name, "Nara Updated");
      assertEquals(profile?.phone, "089 111 2222");

      // Password reset asks Auth for a recovery mail; Mailpit proves delivery.
      const recovery = await authPublic<Record<string, unknown>>(env, "recover", {
        body: { email, redirect_to: "kickoff://reset-password" },
      });
      assertEquals(recovery.status, 200);
      const mail = await waitForMail(env, email);
      assertExists(mail, "the recovery email must reach the fan");
      assert(
        (await mailpitBody(env, mail.ID)).toLowerCase().includes("recovery") ||
          mail.Subject.toLowerCase().includes("reset") ||
          mail.Subject.toLowerCase().includes("password"),
        "the captured mail must be the password-reset message",
      );

      // Deleting the account erases what the schedule says and retains finance.
      const deleted = await invokeDelete(env, fan);
      assertEquals(deleted.status, 200, JSON.stringify(deleted.body));

      const [scrubbed] = await rest<Array<{ email: string; full_name: string; phone: string | null }>>(
        env,
        `profiles?id=eq.${userId}&select=email,full_name,phone`,
        { token: env.service },
      );
      assertEquals(scrubbed?.email, `deleted+${userId}@kickoff.invalid`);
      assertEquals(scrubbed?.full_name, "Deleted account");
      assertEquals(scrubbed?.phone, null);

      const [order] = await rest<Array<{ id: string }>>(
        env,
        `orders?id=eq.${ticket.orderId}&select=id`,
        { token: env.service },
      );
      assertExists(order, "financial rows are retained");

      const [voided] = await rest<Array<{ status: string }>>(
        env,
        `tickets?id=eq.${ticket.ticketId}&select=status`,
        { token: env.service },
      );
      assertEquals(voided?.status, "void");

      const audit = await rest<Array<{ action: string }>>(
        env,
        `audit_logs?entity_id=eq.${userId}&action=eq.account.delete&select=action`,
        { token: env.service },
      );
      assertEquals(audit.length, 1);

      const afterDelete = await authPublic<Record<string, unknown>>(env, "token?grant_type=password", {
        body: { email, password },
      });
      assertEquals(afterDelete.status, 400, "a deleted account cannot sign in");
    } finally {
      await rest(env, `orders?id=eq.${ticket.orderId}`, {
        token: env.service,
        method: "DELETE",
      });
      await authAdmin(env, `users/${userId}`, { method: "DELETE" });
    }
  },
});

Deno.test({
  name: "account lifecycle: a new address receives the signup confirmation mail",
  ignore: !RUN,
  fn: async () => {
    const env = requireEnv();
    const email = uniqueEmail("verify");
    const userId = await createUser(env, {
      email,
      password: "verify-pass-123",
      confirm: false,
    });

    try {
      const resent = await authPublic<Record<string, unknown>>(env, "resend", {
        body: { type: "signup", email },
      });
      assertEquals(resent.status, 200);
      const mail = await waitForMail(env, email);
      assertExists(mail, "the signup confirmation must reach the new address");
      assert(
        (await mailpitBody(env, mail.ID)).toLowerCase().includes("confirm") ||
          mail.Subject.toLowerCase().includes("confirm"),
        "the captured mail must be the confirmation message",
      );
    } finally {
      await authAdmin(env, `users/${userId}`, { method: "DELETE" });
    }
  },
});

/** Calls `delete-account`; returns the raw envelope for status assertions. */
async function invokeDelete(
  env: Env,
  token: string,
): Promise<{ status: number; body: { ok: boolean } }> {
  const response = await fetch(`${env.url}/functions/v1/delete-account`, {
    method: "POST",
    headers: {
      apikey: env.anon,
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: "{}",
  });
  return { status: response.status, body: await response.json() };
}
