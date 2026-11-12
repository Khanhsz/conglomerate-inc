/** Ngữ cảnh của một tick và chữ ký system (ADR-0001 #5). */
import type { Rng } from '../rng';
import type { LoadedContent } from './content';
import type { GameState } from './state';

export interface SimContext {
  readonly content: LoadedContent;
  /** Ngày đang mô phỏng (trước khi clock tăng). */
  readonly day: number;
  /** Generator riêng cho (seed, stream, day); gọi lại với cùng stream trả chuỗi mới từ đầu. */
  rng(stream: string): Rng;
}

/** Mutate `draft` (immer). Không đọc thời gian thực, không Math.random. */
export type System = (draft: GameState, ctx: SimContext) => void;
