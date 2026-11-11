import { CityMap } from './components/CityMap';
import { EventsPanel } from './components/EventsPanel';
import { FinanceTab } from './components/FinanceTab';
import { GameOverDialog } from './components/GameOverDialog';
import { MarketTab } from './components/MarketTab';
import { StoreTable } from './components/StoreTable';
import { TopBar } from './components/TopBar';
import { useUi, type Tab } from './store';

const TABS: readonly (readonly [Tab, string])[] = [
  ['stores', 'Cửa hàng'],
  ['finance', 'Tài chính'],
  ['market', 'Thị trường'],
];

export function App() {
  const { snapshot, tab, setTab } = useUi();
  if (!snapshot) return <p className="loading">Đang khởi tạo mô phỏng…</p>;
  return (
    <div className="app">
      <TopBar snap={snapshot} />
      <main className="layout">
        <CityMap snap={snapshot} />
        <section className="panel tabs-panel">
          <nav className="tabs" role="tablist">
            {TABS.map(([id, label]) => (
              <button
                key={id}
                role="tab"
                data-testid={`tab-${id}`}
                aria-selected={tab === id}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </nav>
          {tab === 'stores' && <StoreTable snap={snapshot} />}
          {tab === 'finance' && <FinanceTab snap={snapshot} />}
          {tab === 'market' && <MarketTab snap={snapshot} />}
        </section>
      </main>
      <EventsPanel snap={snapshot} />
      <GameOverDialog snap={snapshot} />
    </div>
  );
}
