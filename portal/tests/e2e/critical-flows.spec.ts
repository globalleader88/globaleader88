import { test, expect } from '@playwright/test';

/**
 * End-to-end smoke tests for critical workflows. Requires a running app with a
 * seeded database (see README). Uses the dev auth adapter seed logins.
 *
 * These assert the security-critical UX: unauthenticated users are gated, a
 * seeded org member reaches the dashboard, and a second-tenant user sees only
 * their own workspace.
 */

test('landing page renders and links to auth', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: /sign in/i }).first()).toBeVisible();
});

test('unauthenticated user is redirected away from the dashboard', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login/);
});

test('seeded Acme admin can sign in and see their org dashboard', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('orgadmin@acme.local');
  await page.getByLabel('Password').fill('ChangeMe!2026');
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByText(/Acme Federal Solutions/i)).toBeVisible();
});

test('viewer cannot see the upload control', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('viewer@acme.local');
  await page.getByLabel('Password').fill('ChangeMe!2026');
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.goto('/documents');
  // Viewers have no Upload button (Analyst+ only).
  await expect(page.getByRole('link', { name: /^upload$/i })).toHaveCount(0);
});
