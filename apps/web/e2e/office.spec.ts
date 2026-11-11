import { expect, test } from '@playwright/test';

test('lease an office, open a department, see slots used and close it again', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('tab-office').click();
  await page.getByTestId('office-district').selectOption('nw');
  await page.getByTestId('lease-small').click();
  // Lệnh áp ở đầu tick kế tiếp: chạy 1×
  await page.getByTestId('speed-1').click();
  await expect(page.getByTestId('office-slots')).toContainText('0/2', { timeout: 10_000 });

  await page.getByTestId('open-dept-hr').click();
  await expect(page.getByTestId('office-slots')).toContainText('1/2', { timeout: 10_000 });
  await expect(page.getByTestId('close-dept-hr')).toBeVisible();

  await page.getByTestId('close-dept-hr').click();
  await expect(page.getByTestId('open-dept-hr')).toBeVisible({ timeout: 10_000 });
  await page.getByTestId('speed-0').click();
  await expect(page.locator('.events')).toContainText('mở phòng Nhân sự');
});
