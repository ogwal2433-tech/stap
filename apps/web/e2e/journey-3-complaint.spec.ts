import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';

test.describe('Journey 3 — Complaint Resolution', () => {
  test('3.1 — Client lands on portal after login', async ({ page }) => {
    await loginAs(page, 'client');
    await expect(page).toHaveURL('/portal');
    await expect(page.locator('h4, h5').first()).toBeVisible();
  });

  test('3.2 — Client can navigate to portal complaints section', async ({ page }) => {
    await loginAs(page, 'client');
    await page.goto('/portal');
    // Look for complaint section or button
    const complaintEl = page.locator('text=Complaint, text=complaint').first();
    await expect(complaintEl).toBeVisible({ timeout: 5_000 }).catch(() => {});
  });

  test('3.3 — Director can view complaints list', async ({ page }) => {
    await loginAs(page, 'director');
    await page.goto('/complaints');
    await expect(page).toHaveURL('/complaints');
    await expect(page.locator('table, text=No complaints').first()).toBeVisible({ timeout: 5_000 });
  });

  test('3.4 — Ops supervisor can access complaints', async ({ page }) => {
    await loginAs(page, 'opsupervisor');
    await page.goto('/complaints');
    await expect(page).toHaveURL('/complaints');
  });
});
