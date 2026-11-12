import { expect, test } from '@playwright/test';

test('atlas: seven cities, switch city, open stores in two cities, start a new game by seed', async ({
  page,
}) => {
  await page.goto('/?scenario=atlas&seed=7');
  await expect(page.getByTestId('game-seed')).toHaveAttribute('data-seed', '7');
  // 7 thành phố; thành phố đầu (Riverton) có 32 địa điểm.
  await expect(page.locator('[data-testid^="city-"][aria-pressed]')).toHaveCount(7);
  await expect(page.getByTestId('city-riverton')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('city-grid').locator('button.district')).toHaveCount(32);

  await page.getByTestId('district-rv-b1').click();
  await page.getByTestId('open-store').click();

  // Sang Ironbridge (33 địa điểm, thuê rẻ) và mở cửa hàng thứ hai ở đó; vốn ban đầu đủ cho hai điểm bình dân.
  await page.getByTestId('city-ironbridge').click();
  await expect(page.getByTestId('city-ironbridge')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('city-grid').locator('button.district')).toHaveCount(33);
  await page.getByTestId('district-ib-b1').click();
  await page.getByTestId('open-store').click();

  await page.getByTestId('speed-16').click();
  await expect(page.locator('.store-list li')).toHaveCount(2, { timeout: 10_000 });
  await page.getByTestId('speed-0').click();
  // Danh sách cửa hàng ghi rõ thành phố; mỗi thành phố đếm cửa hàng của người chơi.
  await expect(page.locator('.store-list')).toContainText('Riverton · B1');
  await expect(page.locator('.store-list')).toContainText('Ironbridge · B1');
  await expect(page.getByTestId('city-riverton')).toContainText('◆1');
  await expect(page.getByTestId('city-ironbridge')).toContainText('◆1');

  // Hồ sơ đối thủ ở Trụ sở: lọc theo thành phố đang xem, mỗi thẻ có phong cách và doanh thu ước tính.
  await page.getByTestId('open-hq').click();
  await page.getByTestId('tab-marketing').click();
  const cards = page.getByTestId('rival-list').locator('article');
  await expect(cards.first()).toContainText('Doanh thu tháng (ước tính)');
  const here = await cards.count();
  expect(here).toBeGreaterThanOrEqual(2);
  await page.getByTestId('rivals-all').click();
  expect(await cards.count()).toBeGreaterThan(here);
  await page.getByTestId('close-screen').click();

  // Ván mới với seed tự nhập: về ngày 0, không còn cửa hàng, seed hiện trên thanh trên.
  await page.getByTestId('new-game').click();
  await page.getByTestId('new-game-seed').fill('123');
  await page.getByTestId('new-game-start').click();
  await expect(page.getByTestId('game-seed')).toHaveAttribute('data-seed', '123');
  await expect(page.locator('.store-list li')).toHaveCount(0);
  await expect(page.locator('header.topbar')).toHaveAttribute('data-day', '0');
});

test.describe('atlas on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the 7-column city map fits the screen without horizontal scroll', async ({ page }) => {
    await page.goto('/?scenario=atlas&seed=7');
    const width = () => page.evaluate<number>('document.documentElement.scrollWidth');
    for (const city of ['riverton', 'silverlake', 'sunfield']) {
      await page.getByTestId(`city-${city}`).click();
      await expect(page.getByTestId(`city-${city}`)).toHaveAttribute('aria-pressed', 'true');
      expect(await width(), city).toBeLessThanOrEqual(390);
    }
  });
});
