/** Message giữa main thread và Web Worker (ADR-0001 #9). Chỉ dữ liệu thuần, structured-clone được. */
import type { Command } from '@game/sim-core';
import type { Snapshot } from './snapshot';

/** 0 = tạm dừng; 1× = 1 ngày/giây. */
export type Speed = 0 | 1 | 4 | 16;
export const SPEEDS: readonly Speed[] = [0, 1, 4, 16];

export type ToWorker =
  | { readonly type: 'init'; readonly seed?: number }
  | { readonly type: 'command'; readonly command: Command }
  | { readonly type: 'speed'; readonly speed: Speed };

export type FromWorker =
  | { readonly type: 'snapshot'; readonly snapshot: Snapshot }
  /** Lệnh bị từ chối ngay khi gửi (không vào hàng đợi), hoặc lỗi của worker. */
  | { readonly type: 'notice'; readonly level: 'warning' | 'error'; readonly message: string };
