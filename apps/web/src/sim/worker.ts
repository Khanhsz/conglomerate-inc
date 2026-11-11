/// <reference lib="webworker" />
/**
 * Web Worker giữ GameState thật và chạy vòng lặp sim (ADR-0001 #9, spec §7).
 * Thời gian thực chỉ quyết định khi nào gọi step(); bản thân sim vẫn deterministic.
 */
import { createGame, enqueue, step, validateCommand, type GameState } from '@game/sim-core';
import { loadGameContent } from './content';
import type { FromWorker, Speed, ToWorker } from './protocol';
import { buildSnapshot, shouldPause } from './snapshot';

const content = loadGameContent();
let state: GameState = createGame(content);
let speed: Speed = 0;
let timer: ReturnType<typeof setTimeout> | undefined;

function send(message: FromWorker): void {
  postMessage(message);
}

function publish(): void {
  send({ type: 'snapshot', snapshot: buildSnapshot(state, content, speed) });
}

function schedule(): void {
  if (timer !== undefined) clearTimeout(timer);
  timer = speed > 0 ? setTimeout(tick, 1000 / speed) : undefined;
}

function tick(): void {
  const prev = state;
  state = step(state, content);
  if (shouldPause(prev, state)) speed = 0;
  publish();
  schedule();
}

function handle(message: ToWorker): void {
  switch (message.type) {
    case 'init':
      state = createGame(content, message.seed === undefined ? {} : { seed: message.seed });
      speed = 0;
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
