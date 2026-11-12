/** Bước của nút −/+ (M1.7): kẹp trong [min, max], khớp lưới bước tính từ min. */
export function stepValue(
  value: number,
  dir: -1 | 1,
  range: { readonly min: number; readonly max: number; readonly step: number },
): number {
  const { min, max, step } = range;
  const onGrid = min + Math.round((value - min) / step) * step;
  const next =
    onGrid === value
      ? value + dir * step
      : dir > 0
        ? Math.ceil((value - min) / step) * step + min
        : Math.floor((value - min) / step) * step + min;
  return Math.min(max, Math.max(min, next));
}
