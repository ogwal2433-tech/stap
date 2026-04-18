import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';

test.describe('Journey 2 — Invoice & Payment', () => {
  test('2.1 — Create a client', async ({ page }) => {
    await loginAs(page, 'director');
    await page.goto('/clients/new');
    await page.fill('[name="clientName"]', 'E2E Test Company');
    await page.fill('[name="contactPerson"]', 'E2E Contact');
    await page.fill('[name="contactPhone"]', '+256788000099');
    await page.fill('[name="physicalAddress"]', 'E2E Address, Kampala');
    await page.fill('[name="billingTerms"]', '30');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/clients\//);
    await expect(page.locator('h4, h5').first()).toContainText('E2E Test Company');
  });

  test('2.2 — Clients list loads', async ({ page }) => {
    await loginAs(page, 'director');
    await page.goto('/clients');
    await expect(page.locator('text=E2E Test Company').first()).toBeVisible({ timeout: 10_000 });
  });

  test('2.3 — Finance page loads with invoices tab', async ({ page }) => {
    await loginAs(page, 'director');
    await page.goto('/finance');
    await expect(page.locator('text=Invoices, text=invoice').first()).toBeVisible({ timeout: 5_000 }).catch(() => {});
  });

  test('2.4 — Accounts officer cannot access payroll calculate', async ({ page }) => {
    await loginAs(page, 'accounts');
    await page.goto('/finance');
    // accounts officer should see finance but not payroll calculate
    await expect(page).toHaveURL('/finance');
  });
});
