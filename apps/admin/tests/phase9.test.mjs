import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = (...parts) => path.join(root, "src", ...parts);

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(full)));
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(full);
  }
  return files;
}

async function sourceText(relative) {
  return readFile(path.join(root, relative), "utf8");
}

test("P9a-01 ClientProviders exposes query + toast providers without AdminProvider", async () => {
  const file = await sourceText("src/components/providers.tsx");

  assert.match(file, /"use client"/);
  assert.match(file, /QueryClientProvider/);
  assert.match(file, /ToastProvider/);
  assert.doesNotMatch(file, /AdminProvider/);
});

test("P9a-02 root layout stays a Server Component and keeps the font classes", async () => {
  const file = await sourceText("src/app/layout.tsx");

  assert.doesNotMatch(file, /"use client"/);
  assert.match(file, /<ClientProviders>\{children\}<\/ClientProviders>/);
  assert.doesNotMatch(file, /AdminProvider/);
  assert.match(file, /className=\{`\$\{inter\.variable\} \$\{barlow\.variable\} h-full`\}/);
});

test("P9a-03 shared UI exports the migration primitives and amber tone", async () => {
  const file = await sourceText("src/components/ui.tsx");

  for (const exportName of [
    "Table",
    "EmptyState",
    "Skeleton",
    "ConfirmDialog",
    "Toast",
    "ToastProvider",
    "useToast",
  ]) {
    assert.match(file, new RegExp(`export function ${exportName}\\b`));
  }
  assert.match(file, /amber:/);
});

test("P9a-04 global styles include danger button, table and skeleton utilities", async () => {
  const file = await sourceText("src/app/globals.css");

  assert.match(file, /\.btn-danger/);
  assert.match(file, /\.table\b/);
  assert.match(file, /\.table-wrap/);
  assert.match(file, /\.skeleton/);
});

test("P9a-05 settings hooks read and upsert app_settings", async () => {
  const file = await sourceText("src/lib/queries/settings.ts");

  assert.match(file, /export function useSettings\b/);
  assert.match(file, /export function useUpdateSettings\b/);
  assert.match(file, /from\("app_settings"\)/);
  assert.match(file, /upsert\(/);
});

test("P9a-06 settings page renders club profile, gates, notifications and QR key", async () => {
  const file = await sourceText("src/app/dashboard/settings/page.tsx");

  assert.match(file, /useSettings/);
  assert.match(file, /useGates/);
  assert.match(file, /notificationsEnabled/);
  assert.match(file, /qrKeyVersion/);
  assert.match(file, /Key-rotation runbook/);
});

test("P9a-08/09 dashboard and scanner error boundaries use the Next retry contract", async () => {
  for (const relative of ["src/app/dashboard/error.tsx", "src/app/dashboard/scan/error.tsx"]) {
    const file = await sourceText(relative);
    assert.match(file, /"use client"/, relative);
    assert.match(file, /retry: \(\) => void/, relative);
    assert.match(file, /retry\(\)/, relative);
  }
});

test("P9b dashboard layout exposes real session, aria-current and a skip link", async () => {
  const file = await sourceText("src/app/dashboard/layout.tsx");

  assert.match(file, /useSessionGuard/);
  assert.match(file, /aria-current=\{active \? "page" : undefined\}/);
  assert.match(file, /href="#main-content"/);
  assert.match(file, /id="main-content"/);
});

test("P9b migrated dashboard surfaces use query hooks instead of the mock store", async () => {
  const expectations = [
    ["src/app/dashboard/page.tsx", /useOrdersAggregate/, /useScanStats/],
    ["src/app/dashboard/matches/page.tsx", /useMatches/, /useDeleteMatch/],
    ["src/app/dashboard/matches/[id]/page.tsx", /useMatch\b/, /useZones/],
    ["src/app/dashboard/news/page.tsx", /useNews/, /useCreateNews/],
    ["src/app/dashboard/tickets/page.tsx", /useRefund/, /useOrders\b/],
    ["src/app/dashboard/tickets/[orderId]/page.tsx", /useOrder\b/, /useRefund/],
    ["src/app/dashboard/users/page.tsx", /useUsers/, /useUpdateUser/],
    ["src/app/dashboard/scan/page.tsx", /useScan\b/, /useScanEvents/],
  ];

  for (const [relative, first, second] of expectations) {
    const file = await sourceText(relative);
    assert.match(file, first, relative);
    assert.match(file, second, relative);
  }
});

test("P9c no admin source references the legacy store or mock symbols", async () => {
  const files = await listFiles(src());
  const forbidden = /useAdmin\b|AdminProvider\b|mockMatches|mockZones|mockNews|seedOrders|seedTickets|minimumPrice|zoneAvailability/;

  for (const file of files) {
    const text = await readFile(file, "utf8");
    assert.doesNotMatch(text, forbidden, file);
  }

  // A zero-byte leftover would pass the symbol sweep above, so pin deletion.
  const leftovers = await readdir(src("lib"));
  assert.ok(!leftovers.includes("store.tsx"), "legacy lib/store.tsx must be deleted");
  assert.ok(!leftovers.includes("query-provider.tsx"), "superseded query-provider must be deleted");
});
