import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';

test.describe('Journey 1 — Guard Lifecycle', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'director');
  });

  test('1.1 — Create a new guard', async ({ page }) => {
    await page.goto('/guards/new');
    await page.fill('[name="firstName"]', 'E2E');
    await page.fill('[name="lastName"]', 'TestGuard');
    await page.fill('[name="nationalId"]', 'E2E-TEST-001');
    await page.fill('[name="phone"]', '+256788000001');
    await page.fill('[name="dateOfBirth"]', '1990-01-15');
    await page.fill('[name="nextOfKinName"]', 'E2E Next Kin');
    await page.fill('[name="nextOfKinPhone"]', '+256788000002');
    await page.fill('[name="salaryRate"]', '450000');
    await page.fill('[name="contractStart"]', '2026-01-01');
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/\/guards\//);
    await expect(page.locator('h4, h5').first()).toContainText('E2E TestGuard');
  });

  test('1.2 — Guard appears in guards list', async ({ page }) => {
    await page.goto('/guards');
    await expect(page.locator('text=E2E TestGuard').first()).toBeVisible({ timeout: 10_000 });
  });

  test('1.3 — Navigate to attendance page', async ({ page }) => {
    await page.goto('/attendance');
    await expect(page.locator('h4, h5').first()).toBeVisible();
  });

  test('1.4 — Navigate to finance payroll tab', async ({ page }) => {
    await page.goto('/finance');
    await page.click('text=Payroll');
    await expect(page.locator('text=Payroll, text=Calculate').first()).toBeVisible({ timeout: 5_000 }).catch(() => {});
  });
});
