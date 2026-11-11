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
  // Bảng so sánh tháng này / tháng trước: cả hai tháng đều có doanh thu.
  const revenue = page.getByTestId('pnl-revenue').locator('td[data-col="current"], td[data-col="previous"]');
  await expect(revenue).toHaveCount(2);
  const cents = await revenue.evaluateAll((cells) => cells.map((c) => Number(c.getAttribute('data-value'))));
  expect(cents.every((c) => c > 0)).toBe(true);

  // Tài chính cửa hàng: hai ô tháng đang chạy và biểu đồ cột của các tháng đã chốt (2 tháng × 2 series).
  await page.getByTestId('close-screen').click();
  await page.getByTestId('open-store-store-000010').click();
  await page.getByTestId('store-tab-finance').click();
  await expect(page.getByTestId('store-mtd')).toBeVisible();
  const mtd = await page.getByTestId('mtd-revenue').getAttribute('data-cents');
  expect(Number.isSafeInteger(Number(mtd))).toBe(true);
  await expect(page.getByTestId('store-month-chart').locator('path.bar')).toHaveCount(4);
  // Chạm vào tháng đầu: dòng chú thích hiện số của tháng đó.
  const chart = page.getByTestId('store-month-chart');
  await chart.locator('rect.hit').first().click();
  await expect(chart.locator('.column-tooltip')).toContainText('N1·T1');
});
