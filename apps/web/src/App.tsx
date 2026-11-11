import { AlertsPanel } from './components/AlertsPanel';
import { CityMap } from './components/CityMap';
import { EventsPanel } from './components/EventsPanel';
import { FinanceTab } from './components/FinanceTab';
import { GameOverDialog } from './components/GameOverDialog';
import { MarketTab } from './components/MarketTab';
import { OfficeTab } from './components/OfficeTab';
import { StoreTable } from './components/StoreTable';
import { TopBar } from './components/TopBar';
import { useUi, type Tab } from './store';

const TABS: readonly (readonly [Tab, string])[] = [
  ['stores', 'Cửa hàng'],
  ['office', 'Văn phòng'],
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
          {tab === 'office' && <OfficeTab snap={snapshot} />}
          {tab === 'finance' && <FinanceTab snap={snapshot} />}
          {tab === 'market' && <MarketTab snap={snapshot} />}
        </section>
      </main>
      <div className="bottom">
        <AlertsPanel snap={snapshot} />
        <EventsPanel snap={snapshot} />
      </div>
      <GameOverDialog snap={snapshot} />
    </div>
  );
}
