import { expect, test } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.E2E_EMAIL ?? "admin@socialhubpro.app";
const PASSWORD = process.env.E2E_PASSWORD ?? "SocialHub!2026";

test.describe("SocialHub Pro smoke", () => {
  test("redirects anonymous visitors to login", async ({ page }) => {
    await page.goto(`${BASE}/dashboard`);
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("signs in and lands on the dashboard", async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.getByLabel(/email/i).fill(EMAIL);
    await page.getByLabel(/password/i).fill(PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByText(/overview/i).first()).toBeVisible();
  });

  test("opens the publishing queue and analytics", async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.getByLabel(/email/i).fill(EMAIL);
    await page.getByLabel(/password/i).fill(PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    await page.goto(`${BASE}/publishing-queue`);
    await expect(page.getByText(/publishing queue/i).first()).toBeVisible();

    await page.goto(`${BASE}/analytics`);
    await expect(page.getByText(/analytics center/i).first()).toBeVisible();
  });
});
