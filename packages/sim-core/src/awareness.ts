/**
 * Nhận biết thương hiệu theo quận và phân khúc (economic-model §18.1).
 * Ô (e, s) nằm ở vị trí `e × S + s` của mảng phẳng: quận theo thứ tự trong scenario, phân khúc theo id tăng dần
 * (cùng thứ tự với vòng lặp của cầu, §3.3).
 */
import type { IndustryContent, LoadedContent } from './types/content';
import { worldDistricts } from './world';

/** Kênh M1 (§5): toàn thành phố, mọi phân khúc trọng số 1, ngân sách ở `marketingBudgetMonthly`. */
export const GENERAL_CHANNEL = 'general';

const segmentCache = new WeakMap<IndustryContent, readonly string[]>();
const channelCache = new WeakMap<IndustryContent, readonly string[]>();

/** Id phân khúc tăng dần; tính một lần cho mỗi industry pack (content bất biến). */
export function segmentIdsOf(content: LoadedContent): readonly string[] {
  let ids = segmentCache.get(content.industry);
  if (!ids) {
    ids = Object.keys(content.industry.segments).sort();
    segmentCache.set(content.industry, ids);
  }
  return ids;
}

/** Id kênh marketing ngoài `general`, tăng dần. */
export function channelIdsOf(content: LoadedContent): readonly string[] {
  let ids = channelCache.get(content.industry);
  if (!ids) {
    ids = Object.keys(content.industry.marketingChannels).sort();
    channelCache.set(content.industry, ids);
  }
  return ids;
}

export function awarenessCellCount(content: LoadedContent): number {
  return worldDistricts(content).length * segmentIdsOf(content).length;
}

/** Mọi ô cùng một giá trị (trạng thái đầu game; với chỉ kênh `general` các ô luôn bằng nhau). */
export function uniformAwareness(content: LoadedContent, value: number): number[] {
  return Array<number>(awarenessCellCount(content)).fill(value);
}

/** Trung bình theo số dân từng ô (pop × mix); chỉ để hiển thị một con số cho cả công ty. */
export function meanAwareness(content: LoadedContent, cells: readonly number[]): number {
  const segmentIds = segmentIdsOf(content);
  const S = segmentIds.length;
  let weighted = 0;
  let people = 0;
  worldDistricts(content).forEach((d, e) => {
    segmentIds.forEach((segmentId, s) => {
      const n = d.pop * (d.mix[segmentId] ?? 0);
      weighted += n * (cells[e * S + s] ?? 0);
      people += n;
    });
  });
  return people > 0 ? weighted / people : 0;
}
