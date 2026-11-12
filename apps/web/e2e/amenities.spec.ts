import { expect, test } from '@playwright/test';

test('store amenities: switch Wi-Fi on from the store marketing tab', async ({ page }) => {
  await page.goto('/?scenario=m1-default&seed=42');
  await page.getByTestId('district-c').click();
  await page.getByTestId('open-store').click();
  await page.getByTestId('speed-1').click();
  await page.getByTestId('open-store-store-000010').click();
  await page.getByTestId('store-tab-marketing').click();
  await page.getByTestId('amenity-toggle-wifi').click();
  await expect(page.getByTestId('amenity-toggle-wifi')).toHaveAttribute('aria-pressed', 'true', {
    timeout: 10_000,
  });
  await page.getByTestId('speed-0').click();
  await page.getByTestId('store-tab-ops').click();
  await expect(page.getByTestId('store-reviews')).toContainText('Không gian');
});
