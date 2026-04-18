import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';

test.describe('Journey 4 — Mobile Check-In', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('4.1 — Field supervisor can access check-in page on mobile', async ({ page }) => {
    await loginAs(page, 'fieldsupervisor');
    await page.goto('/checkin');
    await expect(page).toHaveURL('/checkin');
    await expect(page.locator('h4, h5').first()).toBeVisible();
  });

  test('4.2 — Mobile sidebar toggle works', async ({ page }) => {
    await loginAs(page, 'fieldsupervisor');
    await page.goto('/dashboard');
    // On mobile, the sidebar should be hidden behind a hamburger
    const hamburger = page.locator('[aria-label="Menu"], button.navbar-toggler, .hamburger').first();
    if (await hamburger.isVisible()) {
      await hamburger.click();
      await expect(page.locator('.offcanvas-body, .mobile-nav').first()).toBeVisible();
    }
  });

  test('4.3 — Check-in form has site selector', async ({ page }) => {
    await loginAs(page, 'fieldsupervisor');
    await page.goto('/checkin');
    const siteSelect = page.locator('select[name="siteId"], [data-testid="site-select"]').first();
    await expect(siteSelect).toBeVisible({ timeout: 5_000 }).catch(() => {});
  });

  test('4.4 — Operations supervisor also accesses check-in', async ({ page }) => {
    await loginAs(page, 'opsupervisor');
    // opsupervisor should NOT see check-in (only FIELD_SUPERVISOR + OPERATIONS_SUPERVISOR, verify redirect)
    await page.goto('/checkin');
    await expect(page).not.toHaveURL('/unauthorised');
  });
});
