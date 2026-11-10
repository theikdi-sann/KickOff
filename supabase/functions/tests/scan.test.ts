import { assertEquals, assertExists } from "@std/assert";

import {
  RUN,
  cleanup,
  issueTicket,
  login,
  requireEnv,
  rest,
  scanTicket,
  scanUndo,
  invoke,
} from "./_commerce.ts";

const GATE = "gate-2";

function key(): string {
  return crypto.randomUUID().replaceAll("-", "");
}

function adminToken(env: ReturnType<typeof requireEnv>): Promise<string> {
  const email = Deno.env.get("ADMIN_EMAIL") ?? "admin@xclub.app";
  const password = Deno.env.get("ADMIN_PASSWORD") ?? "xclubadmin";
  return login(env, email, password);
}

async function assignGate(
  env: ReturnType<typeof requireEnv>,
  matchId: string,
): Promise<void> {
  await rest(env, `gates?id=eq.${GATE}`, {
    token: env.service,
    method: "PATCH",
    body: { match_id: matchId, active: true },
    prefer: "return=minimal",
  });
}

async function patchTicket(
  env: ReturnType<typeof requireEnv>,
  ticketId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  await rest(env, `tickets?id=eq.${ticketId}`, {
    token: env.service,
    method: "PATCH",
    body: patch,
    prefer: "return=minimal",
  });
}

async function readKickoff(env: ReturnType<typeof requireEnv>): Promise<string> {
  const [match] = await rest<Array<{ kickoff_at: string }>>(
    env,
    "matches?id=eq.m-bkk&select=kickoff_at",
    { token: env.service },
  );
  return match!.kickoff_at;
}

async function setKickoff(env: ReturnType<typeof requireEnv>, iso: string): Promise<void> {
  await rest(env, "matches?id=eq.m-bkk", {
    token: env.service,
    method: "PATCH",
    body: { kickoff_at: iso },
    prefer: "return=minimal",
  });
}

function tamper(qr: string): string {
  const payload = JSON.parse(qr.slice("XCLUB-V2:".length)) as { sig: string };
  const last = payload.sig.at(-1) === "A" ? "B" : "A";
  payload.sig = `${payload.sig.slice(0, -1)}${last}`;
  return `XCLUB-V2:${JSON.stringify(payload)}`;
}

Deno.test({
  name: "scan: auth and idempotency header are enforced",
  ignore: !RUN,
  fn: async () => {
    const env = requireEnv();
    const admin = await adminToken(env);
    const fan = await login(env, env.email, env.password);

    const noKey = await scanTicket(
      env,
      admin,
      { qr: "XCLUB-V2:{}", gateId: GATE },
      false,
    );
    assertEquals(noKey.status, 422);

    const notAdmin = await scanTicket(env, fan, {
      qr: "XCLUB-V2:{}",
      gateId: GATE,
      idempotencyKey: key(),
    });
    assertEquals(notAdmin.status, 403);
  },
});

Deno.test({
  name: "scan: valid → replay → duplicate → undo",
  ignore: !RUN,
  fn: async () => {
    const env = requireEnv();
    const admin = await adminToken(env);
    const fan = await login(env, env.email, env.password);
    const seat = "m-bkk-north-A3";
    const ticket = await issueTicket(env, fan, seat, "m-bkk");
    const kickoff = await readKickoff(env);

    try {
      // The seeded fixture is days away; move it inside the gate window.
      await setKickoff(env, new Date().toISOString());
      await assignGate(env, "m-bkk");
      const idempotencyKey = key();

      const first = await scanTicket(env, admin, {
        qr: ticket.qrPayload,
        gateId: GATE,
        idempotencyKey,
      });
      assertEquals(first.status, 200);
      assertEquals(first.body.data?.code, "valid");
      assertExists(first.body.data?.scanEventId);

      const replay = await scanTicket(env, admin, {
        qr: ticket.qrPayload,
        gateId: GATE,
        idempotencyKey,
      });
      assertEquals(replay.status, 200);
      assertEquals(replay.body.data?.replayed, true);
      assertEquals(replay.body.data?.scanEventId, first.body.data?.scanEventId);

      const duplicate = await scanTicket(env, admin, {
        qr: ticket.qrPayload,
        gateId: GATE,
        idempotencyKey: key(),
      });
      assertEquals(duplicate.body.data?.code, "used");

      const undone = await scanUndo(env, admin, {
        scanEventId: first.body.data!.scanEventId!,
        gateId: GATE,
      });
      assertEquals(undone.status, 200);
      assertEquals(undone.body.data?.undone, true);

      const secondUndo = await scanUndo(env, admin, {
        scanEventId: first.body.data!.scanEventId!,
        gateId: GATE,
      });
      assertEquals(secondUndo.status, 409);
    } finally {
      await setKickoff(env, kickoff);
      await cleanup(env, { orderId: ticket.orderId, eventId: ticket.eventId, seatId: seat });
    }
  },
});

Deno.test({
  name: "scan: tampered signature and void tickets are rejected",
  ignore: !RUN,
  fn: async () => {
    const env = requireEnv();
    const admin = await adminToken(env);
    const fan = await login(env, env.email, env.password);
    const seat = "m-bkk-north-A4";
    const ticket = await issueTicket(env, fan, seat, "m-bkk");

    try {
      await assignGate(env, "m-bkk");

      const tampered = await scanTicket(env, admin, {
        qr: tamper(ticket.qrPayload),
        gateId: GATE,
        idempotencyKey: key(),
      });
      assertEquals(tampered.status, 200);
      assertEquals(tampered.body.data?.code, "invalid");

      await patchTicket(env, ticket.ticketId, { status: "void" });
      const voided = await scanTicket(env, admin, {
        qr: ticket.qrPayload,
        gateId: GATE,
        idempotencyKey: key(),
      });
      assertEquals(voided.status, 200);
      assertEquals(voided.body.data?.code, "invalid");
    } finally {
      await cleanup(env, { orderId: ticket.orderId, eventId: ticket.eventId, seatId: seat });
    }
  },
});

Deno.test({
  name: "scan: a pass for another fixture is rejected as wrong_match",
  ignore: !RUN,
  fn: async () => {
    const env = requireEnv();
    const admin = await adminToken(env);
    const fan = await login(env, env.email, env.password);
    const seat = "m-cmi-north-A1";
    const ticket = await issueTicket(env, fan, seat, "m-cmi");

    try {
      await assignGate(env, "m-bkk");
      const result = await scanTicket(env, admin, {
        qr: ticket.qrPayload,
        gateId: GATE,
        idempotencyKey: key(),
      });
      assertEquals(result.status, 200);
      assertEquals(result.body.data?.code, "wrong_match");
    } finally {
      await cleanup(env, { orderId: ticket.orderId, eventId: ticket.eventId, seatId: seat });
    }
  },
});

Deno.test({
  name: "scan: a scan outside the kick-off window is rejected",
  ignore: !RUN,
  fn: async () => {
    const env = requireEnv();
    const admin = await adminToken(env);
    const fan = await login(env, env.email, env.password);
    const seat = "m-bkk-north-A5";
    const ticket = await issueTicket(env, fan, seat, "m-bkk");
    const [match] = await rest<Array<{ kickoff_at: string }>>(
      env,
      "matches?id=eq.m-bkk&select=kickoff_at",
      { token: env.service },
    );

    try {
      await assignGate(env, "m-bkk");
      await rest(env, "matches?id=eq.m-bkk", {
        token: env.service,
        method: "PATCH",
        body: { kickoff_at: new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString() },
        prefer: "return=minimal",
      });

      const result = await scanTicket(env, admin, {
        qr: ticket.qrPayload,
        gateId: GATE,
        idempotencyKey: key(),
      });
      assertEquals(result.status, 200);
      assertEquals(result.body.data?.code, "invalid");
      assertEquals(result.body.data?.message.includes("not open"), true);
    } finally {
      await rest(env, "matches?id=eq.m-bkk", {
        token: env.service,
        method: "PATCH",
        body: { kickoff_at: match!.kickoff_at },
        prefer: "return=minimal",
      });
      await cleanup(env, { orderId: ticket.orderId, eventId: ticket.eventId, seatId: seat });
    }
  },
});

Deno.test({
  name: "scan: 10 parallel scans admit exactly one pass",
  ignore: !RUN,
  fn: async () => {
    const env = requireEnv();
    const admin = await adminToken(env);
    const fan = await login(env, env.email, env.password);
    const seat = "m-bkk-north-A6";
    const ticket = await issueTicket(env, fan, seat, "m-bkk");
    const kickoff = await readKickoff(env);

    try {
      await setKickoff(env, new Date().toISOString());
      await assignGate(env, "m-bkk");
      const results = await Promise.all(
        Array.from({ length: 10 }, () =>
          scanTicket(env, admin, {
            qr: ticket.qrPayload,
            gateId: GATE,
            idempotencyKey: key(),
          }),
        ),
      );
      const codes = results.map((result) => result.body.data?.code);
      assertEquals(codes.filter((code) => code === "valid").length, 1);
      assertEquals(codes.filter((code) => code === "used").length, 9);
    } finally {
      await setKickoff(env, kickoff);
      await cleanup(env, { orderId: ticket.orderId, eventId: ticket.eventId, seatId: seat });
    }
  },
});

Deno.test({
  name: "scan-demo: returns a signed payload for the gate's fixture",
  ignore: !RUN,
  fn: async () => {
    const env = requireEnv();
    const admin = await adminToken(env);

    await assignGate(env, "m-bkk");
    const demo = await invoke<{ payload: string; ticket: { id: string } }>(env, "scan-demo", {
      token: admin,
      body: { gateId: GATE },
    });

    // No valid ticket in a fresh project is a legitimate 409.
    if (demo.status === 200) {
      assertEquals(demo.body.data?.payload.startsWith("XCLUB-V2:"), true);
      assertExists(demo.body.data?.ticket.id);
    } else {
      assertEquals(demo.status, 409);
    }
  },
});
