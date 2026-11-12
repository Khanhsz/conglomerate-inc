import { expect, test } from '@playwright/test';

/** Không tab nào được làm trang cuộn ngang trên điện thoại (lỗi bảng rộng ở Marketing / Tài chính). */
test.use({ viewport: { width: 390, height: 844 } });

test('phone: no horizontal page scroll on any HQ or store tab', async ({ page }) => {
  await page.goto('/?scenario=m1-default&seed=42');
  await page.getByTestId('district-c').click();
  await page.getByTestId('open-store').click();
  await page.getByTestId('speed-16').click();
  const day = async () => Number(await page.locator('header.topbar').getAttribute('data-day'));
  await expect.poll(day, { timeout: 30_000 }).toBeGreaterThanOrEqual(65);
  await page.getByTestId('speed-0').click();
  const width = () => page.evaluate<number>('document.documentElement.scrollWidth');

  await page.getByTestId('open-hq').click();
  for (const tab of ['office', 'finance', 'hr', 'product', 'marketing', 'board']) {
    await page.getByTestId(`tab-${tab}`).click();
    expect(await width(), `HQ tab ${tab}`).toBeLessThanOrEqual(390);
  }
  await page.getByTestId('close-screen').click();
  await page.getByTestId('open-store-store-000010').click();
  for (const tab of ['ops', 'product', 'marketing', 'finance']) {
    await page.getByTestId(`store-tab-${tab}`).click();
    expect(await width(), `store tab ${tab}`).toBeLessThanOrEqual(390);
  }
});
