/** Store ở main thread: chỉ giữ snapshot mới nhất + trạng thái giao diện (spec §7). */
import type { WhatIfChange, WhatIfResult } from '@game/sim-core';
import { create } from 'zustand';
import { ALERT_KINDS, type AlertKind } from './sim/alerts';
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
  /** Cửa hàng đang mở panel chi tiết. */
  readonly inspectedStore: string | null;
  /** Ước tính khi đang kéo thanh trượt (null = không kéo). */
  readonly preview: WhatIfResult | null;
  readonly pauseOn: readonly AlertKind[];
  send(message: ToWorker): void;
  receive(message: FromWorker): void;
  setTab(tab: Tab): void;
  selectDistrict(id: string): void;
  inspect(storeId: string | null): void;
  requestPreview(storeId: string, change: WhatIfChange): void;
  clearPreview(): void;
  togglePause(kind: AlertKind): void;
  dismissNotice(id: number): void;
}

let nextNotice = 1;
let nextRequest = 1;
let latestRequest = 0;
let post: (message: ToWorker) => void = () => undefined;

const PAUSE_KEY = 'conglomerate.pauseOn';
const DEFAULT_PAUSE: readonly AlertKind[] = ['cashForecast', 'rivalNearby'];

/** Lựa chọn tự tạm dừng là tiện ích theo trình duyệt; bộ nhớ có thể bị chặn nên luôn có giá trị mặc định. */
function loadPauseOn(): readonly AlertKind[] {
  try {
    const raw = globalThis.localStorage?.getItem(PAUSE_KEY);
    if (raw === null || raw === undefined) return DEFAULT_PAUSE;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? ALERT_KINDS.filter((k) => parsed.includes(k)) : DEFAULT_PAUSE;
  } catch {
    return DEFAULT_PAUSE;
  }
}

function savePauseOn(kinds: readonly AlertKind[]): void {
  try {
    globalThis.localStorage?.setItem(PAUSE_KEY, JSON.stringify(kinds));
  } catch {
    // bỏ qua: chỉ là tiện ích
  }
}

/** Gắn hàm gửi message tới worker (gọi một lần ở main.tsx) và gửi cấu hình tự tạm dừng. */
export function connect(sender: (message: ToWorker) => void): void {
  post = sender;
  post({ type: 'pauseOn', kinds: useUi.getState().pauseOn });
}

export const useUi = create<UiState>((set, get) => ({
  snapshot: null,
  notices: [],
  tab: 'stores',
  selectedDistrict: null,
  inspectedStore: null,
  preview: null,
  pauseOn: loadPauseOn(),
  send: (message) => post(message),
  receive: (message) => {
    switch (message.type) {
      case 'snapshot':
        set({ snapshot: message.snapshot });
        return;
      case 'whatIf':
        if (message.requestId === latestRequest) set({ preview: message.result });
        return;
      case 'notice':
        set((s) => ({
          notices: [{ id: nextNotice++, level: message.level, message: message.message }, ...s.notices].slice(
            0,
            5,
          ),
        }));
        return;
    }
  },
  setTab: (tab) => set({ tab }),
  selectDistrict: (id) => set({ selectedDistrict: id }),
  inspect: (storeId) => {
    set({ inspectedStore: storeId, preview: null });
    post({ type: 'inspect', storeId });
  },
  requestPreview: (storeId, change) => {
    latestRequest = nextRequest++;
    post({ type: 'whatIf', requestId: latestRequest, storeId, change });
  },
  clearPreview: () => {
    latestRequest = nextRequest++;
    set({ preview: null });
  },
  togglePause: (kind) => {
    const current = get().pauseOn;
    const next = current.includes(kind) ? current.filter((k) => k !== kind) : [...current, kind];
    savePauseOn(next);
    set({ pauseOn: next });
    post({ type: 'pauseOn', kinds: next });
  },
  dismissNotice: (id) => set((s) => ({ notices: s.notices.filter((n) => n.id !== id) })),
}));
