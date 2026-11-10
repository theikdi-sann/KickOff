import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const email = process.env.E2E_ADMIN_EMAIL ?? process.env.NEXT_PUBLIC_DEMO_EMAIL ?? "";
const password = process.env.E2E_ADMIN_PASSWORD ?? process.env.NEXT_PUBLIC_DEMO_PASSWORD ?? "";

// The refund stage needs a throwaway order that actually has a PaymentIntent,
// because the seeded demo orders only carry `payment_ref`. Provision it with
// the service role + Stripe test key when they are exported; otherwise the
// refund case is skipped instead of failing on a fixture it cannot build.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const stripeSecretKey = process.env.STRIPE_SECRET_KEY ?? "";
const canProvisionRefund = Boolean(supabaseUrl && serviceRoleKey && stripeSecretKey);

function localDateTime(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

async function signIn(page: Page): Promise<void> {
  await page.goto(`${baseUrl}/login`);
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: /sign in to dashboard/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

async function deleteFixture(page: Page, opponent: string): Promise<void> {
  await page.goto(`${baseUrl}/dashboard/matches`);
  await page.getByPlaceholder("Search opponent").fill(opponent);
  await expect(page.getByText(`KickOff vs ${opponent}`).first()).toBeVisible();
  await page.getByRole("button", { name: "Delete match" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete fixture" }).click();
  await expect(page.getByText("Fixture deleted")).toBeVisible();
}

/**
 * The scanner needs an active gate, and gate seeding is not part of every
 * environment. Create a stable `e2e-gate` on a fixture that owns a valid pass.
 *
 * Gates with scan history cannot be deleted (`scan_events.gate_id` is
 * ON DELETE RESTRICT, which keeps the audit trail intact), so the gate is
 * reused across runs and deliberately left in place.
 */
const E2E_GATE_ID = "e2e-gate";
const E2E_GATE_NAME = "E2E Gate";

async function ensureGate(page: Page): Promise<string> {
  const gatesLoaded = page.waitForResponse(
    (response) =>
      response.url().includes("/rest/v1/gates") && response.request().method() === "GET",
  );
  await page.goto(`${baseUrl}/dashboard/gates`);
  await gatesLoaded.catch(() => undefined);

  const existing = page.getByText(E2E_GATE_ID, { exact: true });
  if (await existing.isVisible().catch(() => false)) return E2E_GATE_ID;

  await page.getByRole("button", { name: "New gate" }).click();
  // The "Gate code" label wraps its hint text, so match by substring.
  await page.getByLabel("Gate code").fill(E2E_GATE_ID);
  await page.getByLabel("Display name").fill(E2E_GATE_NAME);

  const fixture = page.getByLabel("Assigned fixture");
  const seeded = fixture.locator("option", { hasText: "Bangkok Rovers" }).first();
  const value =
    (await seeded.count()) > 0
      ? await seeded.getAttribute("value")
      : await fixture.locator("option").nth(1).getAttribute("value");
  if (value) await fixture.selectOption(value);

  await page.getByRole("button", { name: "Create gate" }).click();
  await expect(page.getByText(E2E_GATE_ID, { exact: true })).toBeVisible();

  return E2E_GATE_ID;
}

interface ProvisionedOrder {
  id: string;
  paymentIntentId: string;
}

function serviceHeaders(): Record<string, string> {
  return {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`,
    "content-type": "application/json",
  };
}

async function firstId(path: string): Promise<string> {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, { headers: serviceHeaders() });
  if (!response.ok) {
    throw new Error(`Could not read ${path}: ${response.status} ${await response.text()}`);
  }
  const rows = (await response.json()) as Array<{ id: string }>;
  const id = rows[0]?.id;
  if (!id) throw new Error(`No row available in ${path} to anchor the E2E order`);
  return id;
}

/** Creates a confirmed test-mode PaymentIntent plus a paid order row. */
async function provisionPaidOrder(): Promise<ProvisionedOrder> {
  const [userId, matchId] = await Promise.all([
    firstId("profiles?select=id&limit=1"),
    firstId("matches?select=id&limit=1"),
  ]);

  const intentResponse = await fetch("https://api.stripe.com/v1/payment_intents", {
    method: "POST",
    headers: {
      authorization: `Bearer ${stripeSecretKey}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      amount: "10000",
      currency: "thb",
      payment_method: "pm_card_visa",
      confirm: "true",
      "automatic_payment_methods[enabled]": "true",
      "automatic_payment_methods[allow_redirects]": "never",
    }),
  });
  const intent = (await intentResponse.json()) as { id?: string; error?: { message?: string } };
  if (!intentResponse.ok || !intent.id) {
    throw new Error(`Stripe test PaymentIntent failed: ${intent.error?.message ?? intentResponse.status}`);
  }

  const orderId = `ord_e2e_${Date.now()}`;
  const insertResponse = await fetch(`${supabaseUrl}/rest/v1/orders`, {
    method: "POST",
    headers: { ...serviceHeaders(), prefer: "return=minimal" },
    body: JSON.stringify({
      id: orderId,
      user_id: userId,
      match_id: matchId,
      amount_satang: 10000,
      status: "paid",
      payment_intent_id: intent.id,
      paid_at: new Date().toISOString(),
    }),
  });
  if (!insertResponse.ok) {
    throw new Error(`Order fixture insert failed: ${insertResponse.status} ${await insertResponse.text()}`);
  }

  return { id: orderId, paymentIntentId: intent.id };
}

async function deleteOrder(orderId: string): Promise<void> {
  await fetch(`${supabaseUrl}/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}`, {
    method: "DELETE",
    headers: { ...serviceHeaders(), prefer: "return=minimal" },
  });
}

test.describe("admin operations", () => {
  test.skip(
    email.length === 0 || password.length === 0,
    "Set E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD (or NEXT_PUBLIC_DEMO_*) to run operations E2E.",
  );

  test("walks login → match → gate scan → CSV export", async ({ page }) => {
    // Five UI stages plus two fixtures; the default 30s cannot cover cleanup
    // when a step is slow, which left rows behind.
    test.slow();

    const opponent = `E2E Rovers ${Date.now()}`;
    let created = false;

    try {
      await test.step("sign in to the dashboard", async () => {
        await signIn(page);
      });

      await test.step("create a fixture from the matches page", async () => {
        await page.goto(`${baseUrl}/dashboard/matches`);
        await page.getByRole("button", { name: "New fixture" }).click();

        await page.getByLabel("Opponent", { exact: true }).fill(opponent);
        await page.getByLabel("Short code", { exact: true }).fill("E2E");
        await page
          .getByLabel("Kick-off", { exact: true })
          .fill(localDateTime(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)));
        await page.getByRole("button", { name: "Create fixture" }).click();

        // A created fixture lands on its seating page.
        await expect(page).toHaveURL(/\/dashboard\/matches\/[^/]+$/);
        created = true;
        await expect(page.getByText("Fixture created")).toBeVisible();

        await page.goto(`${baseUrl}/dashboard/matches`);
        await page.getByPlaceholder("Search opponent").fill(opponent);
        await expect(page.getByText(`KickOff vs ${opponent}`).first()).toBeVisible();
      });

      await test.step("scan the demo pass at the gate", async () => {
        const gateId = await ensureGate(page);

        await page.goto(`${baseUrl}/dashboard/scan`);
        await page.getByLabel("Validation gate").selectOption(gateId);
        await page.getByRole("button", { name: /Validate demo pass now/i }).click();

        // The result panel replaces "Awaiting a pass" once the server answers.
        // "Queued offline" is deliberately not accepted: it would mask a broken
        // function call (e.g. a CORS preflight rejection) as a pass.
        await expect(page.getByRole("button", { name: "Scan next pass" })).toBeVisible();
        await expect(
          page.getByText(/^(Valid pass|Already scanned|Rejected)$/).first(),
        ).toBeVisible();

        // Admitting the pass opens the 60s undo window; the seeded fixture may
        // be outside its gate window on a given day, in which case the server
        // legitimately answers "Rejected" and no undo is offered.
        const undo = page.getByRole("button", { name: /Undo scan/i });
        if (await undo.isVisible().catch(() => false)) {
          await undo.click();
          await expect(page.getByText("Scan undone. The pass is valid again.")).toBeVisible();
        }
      });

      await test.step("export the orders table as CSV", async () => {
        await page.goto(`${baseUrl}/dashboard/tickets`);
        const downloadPromise = page.waitForEvent("download");
        await page.getByRole("button", { name: "Export CSV" }).click();
        const download = await downloadPromise;

        expect(download.suggestedFilename()).toBe("kickoff-orders-all-p1.csv");
        const path = await download.path();
        expect(path).toBeTruthy();
        const csv = (await readFile(path!, "utf8")).replace(/^\uFEFF/, "");
        expect(csv.split("\r\n")[0]).toBe(
          "Order,Holder,Email,Match,Seats,Amount THB,Status,Created",
        );
      });
    } finally {
      if (created) await deleteFixture(page, opponent).catch(() => undefined);
    }
  });

  test("refunds a paid order through Stripe", async ({ page }) => {
    test.skip(
      !canProvisionRefund,
      "Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and STRIPE_SECRET_KEY to provision a refundable order.",
    );

    const order = await provisionPaidOrder();
    try {
      await signIn(page);
      await page.goto(`${baseUrl}/dashboard/tickets`);
      await page.getByPlaceholder("Search order id or payment ref").fill(order.id);

      const row = page.locator("tr").filter({ hasText: order.id });
      await expect(row).toBeVisible();
      await row.getByRole("button", { name: "Refund" }).click();

      const dialog = page.getByRole("alertdialog", { name: "Refund this order?" });
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: "Refund order" }).click();

      await expect(page.getByText("Refund issued")).toBeVisible();
      await expect(row.getByText("REFUNDED")).toBeVisible();
    } finally {
      await deleteOrder(order.id);
    }
  });
});
