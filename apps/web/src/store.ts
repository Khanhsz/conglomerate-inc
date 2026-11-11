/** Store ở main thread: chỉ giữ snapshot mới nhất + trạng thái giao diện (spec §7). */
import type { WhatIfChange, WhatIfResult } from '@game/sim-core';
import { create } from 'zustand';
import { ALERT_KINDS, type AlertKind } from './sim/alerts';
import type { FromWorker, ToWorker } from './sim/protocol';
import type { Snapshot } from './sim/snapshot';

/** Màn hình (M1.7): bản đồ là trang chủ; Trụ sở và Cửa hàng có tab dưới. */
export const HQ_TABS = ['office', 'finance', 'hr', 'product', 'marketing', 'board'] as const;
export type HqTab = (typeof HQ_TABS)[number];
export const STORE_TABS = ['ops', 'product', 'marketing', 'finance'] as const;
export type StoreTab = (typeof STORE_TABS)[number];
export type Screen =
  | { readonly kind: 'map' }
  | { readonly kind: 'hq'; readonly tab: HqTab }
  | { readonly kind: 'store'; readonly storeId: string; readonly tab: StoreTab };

export interface Notice {
  readonly id: number;
  readonly level: 'warning' | 'error';
  readonly message: string;
}

interface UiState {
  readonly snapshot: Snapshot | null;
  readonly notices: readonly Notice[];
  readonly screen: Screen;
  readonly selectedDistrict: string | null;
  /** Cửa hàng đang mở panel chi tiết. */
  readonly inspectedStore: string | null;
  /** Ước tính khi đang kéo thanh trượt (null = không kéo). */
  readonly preview: WhatIfResult | null;
  readonly pauseOn: readonly AlertKind[];
  send(message: ToWorker): void;
  receive(message: FromWorker): void;
  openMap(): void;
  openHq(tab?: HqTab): void;
  openStore(storeId: string, tab?: StoreTab): void;
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
const HQ_TAB_KEY = 'conglomerate.hqTab';
const STORE_TAB_KEY = 'conglomerate.storeTab';

/** Tab mở gần nhất: tiện ích theo trình duyệt, bộ nhớ có thể bị chặn nên luôn có mặc định. */
function loadTab<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    return allowed.find((t) => t === raw) ?? fallback;
  } catch {
    return fallback;
  }
}

function saveTab(key: string, tab: string): void {
  try {
    globalThis.localStorage?.setItem(key, tab);
  } catch {
    // bỏ qua: chỉ là tiện ích
  }
}
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
  screen: { kind: 'map' },
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
  openMap: () => {
    set({ screen: { kind: 'map' }, inspectedStore: null, preview: null });
    post({ type: 'inspect', storeId: null });
  },
  openHq: (tab) => {
    const next = tab ?? loadTab(HQ_TAB_KEY, HQ_TABS, 'office');
    saveTab(HQ_TAB_KEY, next);
    set({ screen: { kind: 'hq', tab: next } });
  },
  openStore: (storeId, tab) => {
    const next = tab ?? loadTab(STORE_TAB_KEY, STORE_TABS, 'ops');
    saveTab(STORE_TAB_KEY, next);
    set({ screen: { kind: 'store', storeId, tab: next }, inspectedStore: storeId, preview: null });
    post({ type: 'inspect', storeId });
  },
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
