/** Store ở main thread: chỉ giữ snapshot mới nhất + trạng thái giao diện (spec §7). */
import { create } from 'zustand';
import type { FromWorker, ToWorker } from './sim/protocol';
import type { Snapshot } from './sim/snapshot';

export type Tab = 'stores' | 'finance' | 'market';

export interface Notice {
  readonly id: number;
  readonly level: 'warning' | 'error';
  readonly message: string;
}

interface UiState {
  readonly snapshot: Snapshot | null;
  readonly notices: readonly Notice[];
  readonly tab: Tab;
  readonly selectedDistrict: string | null;
  send(message: ToWorker): void;
  receive(message: FromWorker): void;
  setTab(tab: Tab): void;
  selectDistrict(id: string): void;
  dismissNotice(id: number): void;
}

let nextNotice = 1;
let post: (message: ToWorker) => void = () => undefined;

/** Gắn hàm gửi message tới worker (gọi một lần ở main.tsx). */
export function connect(sender: (message: ToWorker) => void): void {
  post = sender;
}

export const useUi = create<UiState>((set) => ({
  snapshot: null,
  notices: [],
  tab: 'stores',
  selectedDistrict: null,
  send: (message) => post(message),
  receive: (message) => {
    if (message.type === 'snapshot') set({ snapshot: message.snapshot });
    else
      set((s) => ({
        notices: [{ id: nextNotice++, level: message.level, message: message.message }, ...s.notices].slice(
          0,
          5,
        ),
      }));
  },
  setTab: (tab) => set({ tab }),
  selectDistrict: (id) => set({ selectedDistrict: id }),
  dismissNotice: (id) => set((s) => ({ notices: s.notices.filter((n) => n.id !== id) })),
}));
