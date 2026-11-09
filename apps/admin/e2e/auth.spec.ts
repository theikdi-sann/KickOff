import { expect, test } from "@playwright/test";

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const email = process.env.E2E_ADMIN_EMAIL ?? process.env.NEXT_PUBLIC_DEMO_EMAIL ?? "";
const password = process.env.E2E_ADMIN_PASSWORD ?? process.env.NEXT_PUBLIC_DEMO_PASSWORD ?? "";

test.describe("admin authentication", () => {
  test.skip(
    email.length === 0 || password.length === 0,
    "Set E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD (or NEXT_PUBLIC_DEMO_*) to run auth E2E.",
  );

  test("rejects a wrong password", async ({ page }) => {
    await page.goto(`${baseUrl}/login`);
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(`${password}-wrong`);
    await page.getByRole("button", { name: /sign in to dashboard/i }).click();

    await expect(page.getByText(/invalid login credentials|invalid/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("signs in and out", async ({ page }) => {
    await page.goto(`${baseUrl}/login`);
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: /sign in to dashboard/i }).click();

    const mfa = process.env.E2E_MFA === "1";
    await expect(page).toHaveURL(mfa ? /\/login\/mfa/ : /\/dashboard/);

    if (!mfa) {
      await expect(page.getByText("Overview").first()).toBeVisible();
      await page.getByRole("button", { name: /sign out/i }).click();
      await expect(page).toHaveURL(/\/login/);
    }
  });

  test("requires the TOTP challenge when the account has 2FA", async ({ page }) => {
    test.skip(process.env.E2E_MFA !== "1", "Set E2E_MFA=1 for an account with TOTP enrolled.");
    await page.goto(`${baseUrl}/login`);
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: /sign in to dashboard/i }).click();

    await expect(page).toHaveURL(/\/login\/mfa/);
    await expect(page.getByText(/two-factor check/i)).toBeVisible();
  });
});
