import { expect, test } from '@playwright/test';

test('finance department: locked until opened, then store P&L, advice and credit line', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('district-c').click();
  await page.getByTestId('open-store').click();
  await page.getByTestId('tab-finance').click();
  await expect(page.getByTestId('finance-locked')).toBeVisible();

  await page.getByTestId('tab-office').click();
  await page.getByTestId('lease-small').click();
  await page.getByTestId('speed-1').click();
  await page.getByTestId('open-dept-finance').click();
  await page.getByTestId('speed-16').click();
  const day = async () => Number(await page.locator('header.topbar').getAttribute('data-day'));
  await expect.poll(day, { timeout: 30_000 }).toBeGreaterThanOrEqual(62);
  await page.getByTestId('speed-0').click();

  await page.getByTestId('tab-finance').click();
  await expect(page.getByTestId('finance-dept')).toBeVisible();
  await expect(page.getByTestId('store-pnl')).toContainText('C');
  await expect(page.getByTestId('finance-advice')).toContainText('Nợ / EBITDA');
});
