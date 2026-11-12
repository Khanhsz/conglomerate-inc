import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import type { FromWorker, ToWorker } from './sim/protocol';
import { parseScenarioId } from './sim/scenarios';
import { connect, randomSeed, useUi } from './store';
// Thứ tự = thứ tự cascade; giữ nguyên khi thêm file.
import './styles/tokens.css';
import './styles/base.css';
import './styles/store-ops.css';
import './styles/office.css';
import './styles/screen.css';
import './styles/parts.css';
import './styles/plans.css';
import './styles/store.css';
import './styles/overflow.css';

const worker = new Worker(new URL('./sim/worker.ts', import.meta.url), { type: 'module' });
worker.addEventListener('message', (event: MessageEvent<FromWorker>) => useUi.getState().receive(event.data));
connect((message: ToWorker) => worker.postMessage(message));

// Ván đầu tiên: `?scenario=`, `?seed=`, `?city=` (dùng cho e2e và để chơi lại một ván); không có seed thì ngẫu nhiên.
const params = new URLSearchParams(location.search);
const seedParam = params.get('seed');
const seed = seedParam !== null && Number.isSafeInteger(Number(seedParam)) ? Number(seedParam) : randomSeed();
const scenario = parseScenarioId(params.get('scenario'));
const cityId = params.get('city');
useUi.getState().newGame({
  seed,
  ...(scenario === null ? {} : { scenario }),
  ...(cityId === null ? {} : { cityId }),
});

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
