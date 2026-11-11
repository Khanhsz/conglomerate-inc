import { expect, test } from '@playwright/test';

test('marketing department: district channel budget raises awareness in that district', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('district-c').click();
  await page.getByTestId('open-store').click();
  await page.getByTestId('open-hq').click();
  await page.getByTestId('tab-office').click();
  await page.getByTestId('lease-small').click();
  await page.getByTestId('speed-1').click();
  await expect(page.getByTestId('office-slots')).toContainText('0/2', { timeout: 10_000 });

  // Chưa mở phòng: thẻ khóa; ngân sách thương hiệu chung vẫn dùng được.
  await page.getByTestId('tab-marketing').click();
  await expect(page.getByTestId('slider-marketing')).toBeVisible();
  await page.getByTestId('unlock-marketing').click();
  await expect(page.getByTestId('marketing-dept')).toBeVisible({ timeout: 10_000 });
  await page.getByTestId('speed-0').click();

  // Quận có cửa hàng (C) được chọn sẵn; đặt $300/tháng tờ rơi cho quận C. Đang tạm dừng: giá trị chờ vẫn hiện.
  const awareness = async (id: string) =>
    Number(await page.getByTestId(`heat-${id}`).getAttribute('data-awareness'));
  await page.getByTestId('segment-students').click();
  const before = await awareness('c');
  for (let i = 0; i < 3; i++) await page.getByTestId('channel-flyers-plus').click();
  await expect(page.getByTestId('channel-flyers')).toContainText('$300.00');

  await page.getByTestId('speed-16').click();
  await expect
    .poll(
      async () =>
        Number(await page.getByTestId('effect-flyers').locator('td').first().getAttribute('data-cents')),
      {
        timeout: 10_000,
      },
    )
    .toBe(30_000);
  await expect.poll(() => awareness('c'), { timeout: 20_000 }).toBeGreaterThan(before + 0.05);
  await page.getByTestId('speed-0').click();

  // Quận không được chi (góc bản đồ) thấp hơn hẳn quận C; kênh có chi hiện tổng ngân sách.
  expect(await awareness('nw')).toBeLessThan((await awareness('c')) - 0.04);
  await expect(page.getByTestId('channel-total-flyers')).toContainText('$300.00');
});
