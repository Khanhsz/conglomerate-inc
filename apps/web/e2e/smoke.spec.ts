import { expect, test } from '@playwright/test';

test('open a store in district C, run 2 months at 16×, see revenue in the P&L', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('district-c').click();
  await page.getByTestId('open-store').click();
  await page.getByTestId('speed-16').click();

  const day = async () => Number(await page.locator('header.topbar').getAttribute('data-day'));
  await expect.poll(day, { timeout: 30_000 }).toBeGreaterThanOrEqual(60);
  await page.getByTestId('speed-0').click();

  await expect(page.getByTestId('store-store-000010')).toBeVisible();

  await page.getByTestId('open-hq').click();
  await page.getByTestId('tab-finance').click();
  const revenue = page.getByTestId('pnl-revenue').locator('td');
  await expect(revenue).toHaveCount(2);
  const cents = await revenue.evaluateAll((cells) => cells.map((c) => Number(c.getAttribute('data-cents'))));
  expect(cents.every((c) => c > 0)).toBe(true);
});
