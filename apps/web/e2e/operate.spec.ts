import { expect, test, type Locator } from '@playwright/test';

/** Kéo thanh trượt như người dùng: sự kiện `input` khi đang kéo, `change` khi thả tay. */
async function drag(slider: Locator, position: number, release: boolean): Promise<void> {
  await slider.evaluate(
    (el, [pos, rel]) => {
      // Bỏ qua value tracker của React (setter trên prototype của input) để onChange nhận giá trị mới.
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set?.call(el, String(pos));
      el.dispatchEvent(new Event('input', { bubbles: true }));
      if (rel) el.dispatchEvent(new Event('change', { bubbles: true }));
    },
    [position, release] as const,
  );
}

test('price slider previews the estimate while dragging and commits on release', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('district-c').click();
  await page.getByTestId('open-store').click();
  await page.getByTestId('speed-16').click();
  const day = async () => Number(await page.locator('header.topbar').getAttribute('data-day'));
  await expect.poll(day, { timeout: 30_000 }).toBeGreaterThanOrEqual(10);
  await page.getByTestId('speed-0').click();

  const id = 'store-000010';
  await page.getByTestId(`open-store-${id}`).click();
  await expect(page.locator('.store-detail')).toBeVisible();
  await expect(page.getByTestId('gap-summary')).toBeVisible();
  await expect(page.getByTestId('store-reviews')).toContainText('Phục vụ');
  await expect(page.getByTestId('area-share')).toContainText('Không mua');

  const slider = page.getByTestId('slider-price');
  const priceCell = page.getByTestId(`price-${id}`);
  const priceBefore = await priceCell.textContent();
  const estimate = page.getByTestId('estimate-contribution');
  const estimateBefore = await estimate.textContent();
  const max = Number(await slider.getAttribute('max'));

  // Đang kéo: ước tính đổi, giá trong bảng chưa đổi.
  await drag(slider, max, false);
  await expect(estimate).not.toHaveText(estimateBefore ?? '');
  await expect(priceCell).toHaveText(priceBefore ?? '');

  // Thả tay khi đang dừng: lệnh vào hàng đợi, bảng hiện giá chờ áp dụng, có nút hoàn tác.
  await drag(slider, max, true);
  await expect(priceCell.locator('.pending')).toBeVisible();
  await expect(page.getByTestId('pending-note')).toBeVisible();
  await expect(page.getByRole('button', { name: /Hoàn tác/ })).toBeVisible();

  // Chạy tiếp một ngày: giá mới có hiệu lực.
  await page.getByTestId('speed-1').click();
  await expect(priceCell.locator('.pending')).toHaveCount(0, { timeout: 10_000 });
  await page.getByTestId('speed-0').click();
  await expect(priceCell).not.toHaveText(priceBefore ?? '');
});
