import { expect, test } from '@playwright/test';

test('HR department: roster is visible, policies unlock once the department is open', async ({ page }) => {
  await page.goto('/?scenario=m1-default&seed=42');
  await page.getByTestId('district-c').click();
  await page.getByTestId('open-store').click();
  await page.getByTestId('open-hq').click();
  await page.getByTestId('tab-hr').click();
  await expect(page.getByTestId('hr-locked')).toBeVisible();

  await page.getByTestId('tab-office').click();
  await page.getByTestId('lease-small').click();
  await page.getByTestId('speed-1').click();
  await page.getByTestId('open-dept-hr').click();
  await expect(page.getByTestId('office-slots')).toContainText('1/2', { timeout: 10_000 });

  await page.getByTestId('tab-hr').click();
  await expect(page.getByTestId('hr-roster')).toContainText('C');
  await page.getByTestId('training-2').click();
  await expect(page.getByTestId('training-2')).toHaveAttribute('aria-checked', 'true', { timeout: 10_000 });
  await page.getByTestId('wage-standard-on').click();
  await expect(page.locator('#slider-wage-ratio')).toBeVisible({ timeout: 10_000 });
  await page.getByTestId('speed-0').click();
});
