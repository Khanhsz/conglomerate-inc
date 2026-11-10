import { createRngFactory } from '../rng';
import type { LoadedContent } from '../types/content';
import type { SimContext } from '../types/context';
import type { GameState } from '../types/state';

/** Context cho một ngày bất kỳ (test chạy từng system riêng lẻ). */
export function ctxAt(state: GameState, content: LoadedContent, day = state.clock.day): SimContext {
  const factory = createRngFactory(state.seed);
  return { content, day, rng: (stream) => factory(stream, day) };
}
