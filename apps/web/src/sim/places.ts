/** Tên hiển thị của địa điểm và khu (M1.8). Thuần chuỗi, dùng được ở worker và UI. */
import type { Zone } from '@game/sim-core';

/** Mã ngắn của địa điểm trong thành phố: `rv-c3` → `C3`; id M1 như `nw` → `NW`. */
export function districtLabel(districtId: string): string {
  const cut = districtId.lastIndexOf('-');
  return (cut < 0 ? districtId : districtId.slice(cut + 1)).toUpperCase();
}

/** Tên đầy đủ: thêm tên thành phố khi scenario có nhiều thành phố (`Riverton · C3`). */
export function placeName(
  cities: readonly { readonly name: string; readonly districtIds: readonly string[] }[],
  districtId: string,
): string {
  const label = districtLabel(districtId);
  if (cities.length <= 1) return label;
  const city = cities.find((c) => c.districtIds.includes(districtId));
  return city ? `${city.name} · ${label}` : label;
}

export const ZONE_LABEL: { readonly [Z in Zone]: string } = {
  budget: 'Bình dân',
  central: 'Trung tâm',
  premium: 'Cao cấp',
};
