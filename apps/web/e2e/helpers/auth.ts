import { Page } from '@playwright/test';

type Role = 'director' | 'accounts' | 'guard' | 'client' | 'opsupervisor' | 'admin' | 'trainer' | 'fieldsupervisor';

const CREDENTIALS: Record<Role, { email: string; password: string }> = {
  director:       { email: 'director@security360.co.ug',         password: '12345678' },
  accounts:       { email: 'accounts@security360.co.ug',         password: '12345678' },
  guard:          { email: 'guard.wasswa@security360.co.ug',     password: '12345678' },
  client:         { email: 'client.kakooza@security360.co.ug',   password: '12345678' },
  opsupervisor:   { email: 'opsupervisor@security360.co.ug',     password: '12345678' },
  admin:          { email: 'admin@security360.co.ug',            password: '12345678' },
  trainer:        { email: 'trainer@security360.co.ug',          password: '12345678' },
  fieldsupervisor:{ email: 'fieldsupervisor@security360.co.ug',  password: '12345678' },
};

export async function loginAs(page: Page, role: Role): Promise<void> {
  const { email, password } = CREDENTIALS[role];
  await page.goto('/login');
  await page.fill('[type="email"]', email);
  await page.fill('[type="password"]', password);
  await page.click('[type="submit"]');
  await page.waitForURL(/\/(dashboard|portal)/);
}

export async function logout(page: Page): Promise<void> {
  await page.click('text=Sign out');
  await page.waitForURL('/login');
}
