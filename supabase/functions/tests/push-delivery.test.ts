import { assertEquals, assertExists, assert } from "@std/assert";

import {
  RUN,
  cleanup,
  invoke,
  issueTicket,
  login,
  requireEnv,
  rest,
} from "./_commerce.ts";

interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: { url?: string };
}

interface PushBatches {
  batches: PushMessage[][];
}

async function stub<T>(path: string, method = "GET"): Promise<T> {
  const base = Deno.env.get("PUSH_STUB_URL");
  if (!base) throw new Error("PUSH_STUB_URL is required for the push suite");
  const response = await fetch(`${base}${path}`, { method });
  if (!response.ok) throw new Error(`push stub ${path} → ${response.status}`);
  return (await response.json()) as T;
}

async function invokeCron<T>(
  env: ReturnType<typeof requireEnv>,
  secret: string,
  body: unknown,
): Promise<{ status: number; body: { ok: boolean; data?: T; error?: { message: string } } }> {
  const response = await fetch(`${env.url}/functions/v1/send-kickoff-reminders`, {
    method: "POST",
    headers: {
      apikey: env.anon,
      authorization: `Bearer ${env.service}`,
      "content-type": "application/json",
      "x-cron-secret": secret,
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

function expoToken(): string {
  return `ExponentPushToken[${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}]`;
}

Deno.test({
  name: "push delivery: a reminder fans out to the registered device with the match copy",
  ignore: !RUN,
  fn: async () => {
    const env = requireEnv();
    const fan = await login(env, env.email, env.password);
    const ticket = await issueTicket(env, fan, "m-bkk-north-A11");
    const token = expoToken();

    await stub("/__reset", "POST");

    try {
      const registered = await invoke<{ registered: boolean }>(env, "devices", {
        token: fan,
        body: { token, platform: "android" },
      });
      assertEquals(registered.status, 200);
      assertEquals(registered.body.data?.registered, true);

      const [secretRow] = await rest<Array<{ value: string }>>(
        env,
        "app_secrets?key=eq.reminders_secret&select=value",
        { token: env.service },
      );
      const secret = secretRow?.value;
      assertExists(secret);

      const sent = await invokeCron<{ sent: number; devices: number; matchId: string }>(
        env,
        secret,
        { matchId: "m-bkk" },
      );
      assertEquals(sent.status, 200, JSON.stringify(sent.body));
      assertEquals(sent.body.data?.sent, 1);
      assertEquals(sent.body.data?.devices, 1);

      const { batches } = await stub<PushBatches>("/__batches");
      const messages = batches.flat();
      const message = messages.find((item) => item.to === token);
      assertExists(message, "the registered token must receive a message");
      assertEquals(message.title, "Matchday is coming");
      assert(message.body.includes("Bangkok Rovers"), message.body);
      assert(message.body.includes("KickOff Arena"), message.body);
      assertEquals(message.data?.url, "/(tabs)");

      await rest(env, `device_tokens?token=eq.${encodeURIComponent(token)}`, {
        token: env.service,
        method: "DELETE",
      });

      const noDevices = await invokeCron<{ sent: number; reason: string }>(env, secret, {
        matchId: "m-bkk",
      });
      assertEquals(noDevices.status, 200);
      assertEquals(noDevices.body.data?.sent, 0);
      assertEquals(noDevices.body.data?.reason, "no registered devices");

      const badSecret = await fetch(`${env.url}/functions/v1/send-kickoff-reminders`, {
        method: "POST",
        headers: {
          apikey: env.anon,
          "content-type": "application/json",
          "x-cron-secret": "wrong",
        },
        body: JSON.stringify({ matchId: "m-bkk" }),
      });
      assertEquals(badSecret.status, 401);
    } finally {
      await rest(env, `device_tokens?token=eq.${encodeURIComponent(token)}`, {
        token: env.service,
        method: "DELETE",
      });
      await cleanup(env, { orderId: ticket.orderId, eventId: ticket.eventId });
    }
  },
});
