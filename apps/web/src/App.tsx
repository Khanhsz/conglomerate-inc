import { GameOverDialog } from './components/GameOverDialog';
import { HqScreen } from './components/HqScreen';
import { MapScreen } from './components/MapScreen';
import { StoreScreen } from './components/StoreScreen';
import { TopBar } from './components/TopBar';
import { useUi } from './store';

/** Bản đồ là trang chủ; Trụ sở và Cửa hàng là màn hình riêng có tab (M1.7). */
export function App() {
  const { snapshot, screen } = useUi();
  if (!snapshot) return <p className="loading">Đang khởi tạo mô phỏng…</p>;
  return (
    <div className={`app app-${screen.kind}`}>
      <TopBar snap={snapshot} />
      {screen.kind === 'map' && <MapScreen snap={snapshot} />}
      {screen.kind === 'hq' && <HqScreen snap={snapshot} tab={screen.tab} />}
      {screen.kind === 'store' && <StoreScreen snap={snapshot} storeId={screen.storeId} tab={screen.tab} />}
      <GameOverDialog snap={snapshot} />
    </div>
  );
}
