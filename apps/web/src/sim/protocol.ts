/** Message giữa main thread và Web Worker (ADR-0001 #9). Chỉ dữ liệu thuần, structured-clone được. */
import type { Command, WhatIfChange, WhatIfResult } from '@game/sim-core';
import type { AlertKind } from './alerts';
import type { Snapshot } from './snapshot';

/** 0 = tạm dừng; 1× = 1 ngày/giây. */
export type Speed = 0 | 1 | 4 | 16;
export const SPEEDS: readonly Speed[] = [0, 1, 4, 16];

export type ToWorker =
  | { readonly type: 'init'; readonly seed?: number }
  | { readonly type: 'command'; readonly command: Command }
  | { readonly type: 'speed'; readonly speed: Speed }
  /** Xem chi tiết một cửa hàng (null = đóng panel). */
  | { readonly type: 'inspect'; readonly storeId: string | null }
  /** Ước tính khi kéo thanh trượt; trả lời bằng message 'whatIf' cùng requestId. */
  | {
      readonly type: 'whatIf';
      readonly requestId: number;
      readonly storeId: string;
      readonly change: WhatIfChange;
    }
  /** Các loại cảnh báo làm game tự tạm dừng khi mới xuất hiện. */
  | { readonly type: 'pauseOn'; readonly kinds: readonly AlertKind[] };

export type FromWorker =
  | { readonly type: 'snapshot'; readonly snapshot: Snapshot }
  | { readonly type: 'whatIf'; readonly requestId: number; readonly result: WhatIfResult | null }
  /** Lệnh bị từ chối ngay khi gửi (không vào hàng đợi), hoặc lỗi của worker. */
  | { readonly type: 'notice'; readonly level: 'warning' | 'error'; readonly message: string };
