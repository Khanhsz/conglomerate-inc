import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import type { FromWorker, ToWorker } from './sim/protocol';
import { connect, useUi } from './store';
import './styles.css';

const worker = new Worker(new URL('./sim/worker.ts', import.meta.url), { type: 'module' });
worker.addEventListener('message', (event: MessageEvent<FromWorker>) => useUi.getState().receive(event.data));
connect((message: ToWorker) => worker.postMessage(message));

const seedParam = new URLSearchParams(location.search).get('seed');
if (seedParam !== null && Number.isSafeInteger(Number(seedParam))) {
  useUi.getState().send({ type: 'init', seed: Number(seedParam) });
}

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
