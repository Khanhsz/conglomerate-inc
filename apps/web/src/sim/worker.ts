/// <reference lib="webworker" />
/**
 * Web Worker giữ GameState thật và chạy vòng lặp sim (ADR-0001 #9, spec §7).
 * Thời gian thực chỉ quyết định khi nào gọi step(); bản thân sim vẫn deterministic.
 */
import { createGame, enqueue, step, validateCommand, whatIf, type GameState } from '@game/sim-core';
import { newAlertKeys, type Alert, type AlertKind } from './alerts';
import { loadGameContent } from './content';
import type { FromWorker, Speed, ToWorker } from './protocol';
import { buildSnapshot, playerId, shouldPause } from './snapshot';

const content = loadGameContent();
let state: GameState = createGame(content);
let speed: Speed = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let inspected: string | null = null;
let pauseKinds: ReadonlySet<AlertKind> = new Set();
let lastAlerts: readonly Alert[] = [];

function send(message: FromWorker): void {
  postMessage(message);
}

/** Dựng snapshot; nếu có cảnh báo mới thuộc loại được chọn thì tạm dừng trước khi gửi. */
function publish(checkAlerts = false): void {
  let snapshot = buildSnapshot(state, content, speed, inspected);
  if (checkAlerts) {
    const fresh = new Set(newAlertKeys(lastAlerts, snapshot.alerts));
    if (speed > 0 && snapshot.alerts.some((a) => fresh.has(a.key) && pauseKinds.has(a.kind))) {
      speed = 0;
      snapshot = { ...snapshot, speed };
    }
  }
  lastAlerts = snapshot.alerts;
  send({ type: 'snapshot', snapshot });
}

function schedule(): void {
  if (timer !== undefined) clearTimeout(timer);
  timer = speed > 0 ? setTimeout(tick, 1000 / speed) : undefined;
}

function tick(): void {
  const prev = state;
  state = step(state, content);
  if (shouldPause(prev, state)) speed = 0;
  publish(true);
  schedule();
}

function handle(message: ToWorker): void {
  switch (message.type) {
    case 'init':
      state = createGame(content, message.seed === undefined ? {} : { seed: message.seed });
      speed = 0;
      inspected = null;
      lastAlerts = [];
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
