import { assertEquals, assertExists, assert } from "@std/assert";

import {
  RUN,
  cleanup,
  issueTicket,
  login,
  requireEnv,
  rest,
} from "./_commerce.ts";

type Env = ReturnType<typeof requireEnv>;

async function adminToken(env: Env): Promise<string> {
  const email = Deno.env.get("ADMIN_EMAIL") ?? "admin@kickoff.app";
  const password = Deno.env.get("ADMIN_PASSWORD") ?? "kickoffadmin";
  return login(env, email, password);
}

async function raw(
  env: Env,
  path: string,
  input: { token: string; method: string },
): Promise<{ status: number; text: string }> {
  const response = await fetch(`${env.url}/rest/v1/${path}`, {
    method: input.method,
    headers: {
      apikey: env.anon,
      authorization: `Bearer ${input.token}`,
      prefer: "return=minimal",
    },
  });
  return { status: response.status, text: await response.text() };
}

Deno.test({
  name: "fixture admin: create, edit, reschedule, then refuse delete while tickets exist",
  ignore: !RUN,
  fn: async () => {
    const env = requireEnv();
    const admin = await adminToken(env);
    const fan = await login(env, env.email, env.password);

    const created = await rest<{ row: { id: string } }>(env, "rpc/admin_create_match_full", {
      token: admin,
      method: "POST",
      body: {
        p_match: {
          opponent: "Wave One FC",
          opponentShort: "WAV",
          kickoffAt: new Date(Date.now() + 20 * 864e5).toISOString(),
          competition: "Thai Premier League",
          homeAway: "home",
          posterColors: ["#0B6B3A", "#052E1A"],
          accent: "#F4C430",
        },
        p_venue: { id: "v_kickoff" },
        p_zones: [],
        p_gates: [],
        p_gate_ids: [],
        p_prices: null,
      },
    });
    const matchId = created.row.id;
    assertExists(matchId);

    let ticket: Awaited<ReturnType<typeof issueTicket>> | null = null;
    try {
      const createAudit = await rest<Array<{ action: string }>>(
        env,
        `audit_logs?entity_id=eq.${matchId}&action=eq.match.create&select=action`,
        { token: env.service },
      );
      assertEquals(createAudit.length, 1, "creating a fixture is audited");

      const edited = await rest<{ row: { opponent: string } }>(env, "rpc/admin_update_match", {
        token: admin,
        method: "POST",
        body: {
          p_match_id: matchId,
          p_patch: { opponent: "Edited Rovers", opponent_short: "EDR" },
        },
      });
      assertEquals(edited.row.opponent, "Edited Rovers");

      const kickoff = new Date(Date.now() + 25 * 864e5).toISOString();
      const moved = await rest<{ row: { kickoff_at: string } }>(env, "rpc/admin_update_match", {
        token: admin,
        method: "POST",
        body: {
          p_match_id: matchId,
          p_patch: { kickoff_at: kickoff },
          p_reason: "TV broadcast request",
        },
      });
      assertEquals(new Date(moved.row.kickoff_at).toISOString(), kickoff);

      const rescheduleAudit = await rest<Array<{ metadata: { reason: string } }>>(
        env,
        `audit_logs?entity_id=eq.${matchId}&action=eq.reschedule&select=metadata`,
        { token: env.service },
      );
      assertEquals(rescheduleAudit[0]?.metadata.reason, "TV broadcast request");

      // Sell one seat on the fixture, then prove deletion refuses to orphan it.
      const [zone] = await rest<Array<{ id: string }>>(
        env,
        `zones?match_id=eq.${matchId}&select=id&limit=1`,
        { token: env.service },
      );
      assertExists(zone);
      const [seat] = await rest<Array<{ id: string }>>(
        env,
        `seats?zone_id=eq.${zone.id}&select=id&limit=1`,
        { token: env.service },
      );
      assertExists(seat);
      ticket = await issueTicket(env, fan, seat.id, matchId);

      const blocked = await raw(env, `matches?id=eq.${matchId}`, {
        token: admin,
        method: "DELETE",
      });
      assert(
        blocked.status === 409 || blocked.status === 400,
        `a fixture with sold tickets must not delete: ${blocked.status} ${blocked.text}`,
      );

      await rest(env, `orders?id=eq.${ticket.orderId}`, {
        token: env.service,
        method: "DELETE",
      });
      // Deleting the order cascades tickets, but the hold row is what the
      // fixture FK still points at — release it before deleting the fixture.
      await rest(env, `seat_holds?match_id=eq.${matchId}`, {
        token: env.service,
        method: "DELETE",
      });
      ticket = null;

      const removed = await raw(env, `matches?id=eq.${matchId}`, {
        token: admin,
        method: "DELETE",
      });
      assertEquals(removed.status, 204, removed.text);

      const [gone] = await rest<Array<{ id: string }>>(
        env,
        `matches?id=eq.${matchId}&select=id`,
        { token: env.service },
      );
      assertEquals(gone, undefined);
    } finally {
      if (ticket) {
        await cleanup(env, { orderId: ticket.orderId, eventId: ticket.eventId });
      }
      await rest(env, `seat_holds?match_id=eq.${matchId}`, {
        token: env.service,
        method: "DELETE",
      });
      await rest(env, `matches?id=eq.${matchId}`, {
        token: env.service,
        method: "DELETE",
      });
    }
  },
});
