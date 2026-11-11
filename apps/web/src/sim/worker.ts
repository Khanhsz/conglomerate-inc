/// <reference lib="webworker" />
/**
 * Web Worker giữ GameState thật và chạy vòng lặp sim (ADR-0001 #9, spec §7).
 * Thời gian thực chỉ quyết định khi nào gọi step(); bản thân sim vẫn deterministic.
 */
import { createGame, enqueue, step, validateCommand, whatIf, type GameState } from '@game/sim-core';
import { computeAlerts, newAlertKeys, type Alert, type AlertKind } from './alerts';
import { loadGameContent } from './content';
import type { FromWorker, Speed, ToWorker } from './protocol';
import { buildSnapshot, playerId, shouldPause } from './snapshot';

const content = loadGameContent();
let state: GameState = createGame(content);
let speed: Speed = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let inspected: string | null = null;
let pauseKinds: ReadonlySet<AlertKind> = new Set();
/** Cảnh báo đã thấy; khởi tạo từ state ban đầu để cảnh báo có sẵn không bị coi là mới. */
let lastAlerts: readonly Alert[] = computeAlerts(state);
let lastPublishAt = 0;
/** Khoảng tối thiểu giữa hai snapshot khi đang chạy (ms). */
const MIN_PUBLISH_MS = 100;

function send(message: FromWorker): void {
  postMessage(message);
}

/** Dựng và gửi snapshot (đọc state hiện tại, không đổi gì). */
function publish(): void {
  lastPublishAt = performance.now();
  send({ type: 'snapshot', snapshot: buildSnapshot(state, content, speed, inspected) });
}

/** Cảnh báo mới thuộc loại người chơi chọn thì tạm dừng; xét mỗi tick dù snapshot có được gửi hay không. */
function checkAlerts(): void {
  const alerts = computeAlerts(state);
  const fresh = new Set(newAlertKeys(lastAlerts, alerts));
  if (speed > 0 && alerts.some((a) => fresh.has(a.key) && pauseKinds.has(a.kind))) speed = 0;
  lastAlerts = alerts;
}

function schedule(): void {
  if (timer !== undefined) clearTimeout(timer);
  timer = speed > 0 ? setTimeout(tick, 1000 / speed) : undefined;
}

function tick(): void {
  const prev = state;
  state = step(state, content);
  if (shouldPause(prev, state)) speed = 0;
  checkAlerts();
  // Ở 16× gửi tối đa ~10 snapshot/giây; tạm dừng thì gửi ngay để UI khớp state.
  if (speed === 0 || performance.now() - lastPublishAt >= MIN_PUBLISH_MS) publish();
  schedule();
}

function handle(message: ToWorker): void {
  switch (message.type) {
    case 'init':
      state = createGame(content, message.seed === undefined ? {} : { seed: message.seed });
      speed = 0;
      inspected = null;
      lastAlerts = computeAlerts(state);
      break;
    case 'command': {
      // Kiểm tra ngay để báo lỗi tức thì; lệnh hợp lệ vào hàng đợi và áp dụng ở đầu tick kế tiếp.
      const verdict = validateCommand(state, content, message.command);
      if (!verdict.ok) {
        send({ type: 'notice', level: 'warning', message: `${message.command.type}: ${verdict.reason}` });
        return;
      }
      state = enqueue(state, message.command);
      break;
    }
    case 'speed':
      speed = message.speed;
      break;
    case 'inspect':
      inspected = message.storeId;
      break;
    case 'whatIf': {
      // Chỉ trả lời cho cửa hàng đang mở của người chơi; không đổi state.
      const store = state.stores[message.storeId];
      const result =
        store && store.status === 'open' && store.companyId === playerId(state)
          ? whatIf(state, content, message.storeId, message.change)
          : null;
      send({ type: 'whatIf', requestId: message.requestId, result });
      return;
    }
    case 'pauseOn':
      pauseKinds = new Set(message.kinds);
      return;
  }
  publish();
  schedule();
}

addEventListener('message', (event: MessageEvent<ToWorker>) => {
  try {
    handle(event.data);
  } catch (error) {
    speed = 0;
    schedule();
    send({ type: 'notice', level: 'error', message: error instanceof Error ? error.message : String(error) });
  }
});

publish();
