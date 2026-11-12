import { OFFICE_SIZE_LABEL } from '@game/sim-core';
import type { Snapshot } from '../sim/snapshot';
import { useUi } from '../store';
import { int, pct, usd } from '../format';
import { AlertsPanel } from './AlertsPanel';
import { CityMap } from './CityMap';
import { EventsPanel } from './EventsPanel';
import { CityShareDonut } from './MarketTab';
import { placeName } from '../sim/places';

/** Trang chủ (M1.7): bản đồ, lối vào Trụ sở, danh sách cửa hàng, cảnh báo và sự kiện. */
export function MapScreen({ snap }: { snap: Snapshot }) {
  const { openHq, openStore } = useUi();
  const office = snap.office.office;
  return (
    <main className="map-screen">
      <CityMap snap={snap} />
      <div className="map-side">
        <button type="button" className="card hq-card" data-testid="open-hq" onClick={() => openHq()}>
          <span className="hq-icon" aria-hidden="true">
            ▦
          </span>
          <span>
            <strong>Trụ sở</strong>
            <span className="small muted">
              {office
                ? `Văn phòng ${OFFICE_SIZE_LABEL[office.size]} · quận ${placeName(snap.cities, office.districtId)} · ${office.slotsUsed}/${office.slots} phòng`
                : 'Chưa thuê văn phòng · tài chính, nhân sự, marketing'}
            </span>
          </span>
          <span aria-hidden="true">›</span>
        </button>

        <section className="panel">
          <h2>Cửa hàng của bạn</h2>
          {snap.stores.length === 0 ? (
            <p className="muted">Chưa có cửa hàng nào. Chọn một quận trên bản đồ để mở.</p>
          ) : (
            <ul className="store-list">
              {snap.stores.map((r) => {
                const p = snap.pending.stores[r.id];
                return (
                  <li key={r.id} data-testid={`store-${r.id}`}>
                    <button type="button" data-testid={`open-store-${r.id}`} onClick={() => openStore(r.id)}>
                      <span className="store-name">
                        {snap.cities.length > 1 ? '' : 'Quận '}
                        {placeName(snap.cities, r.districtId)}
                        {p && <span className="pending small"> · có thay đổi chờ</span>}
                      </span>
                      <span className="small muted">
                        {int(r.servedToday)} khách/ngày · utilization {pct(r.utilizationToday, 0)} · giá{' '}
                        <span data-testid={`price-${r.id}`}>{usd(r.price)}</span>
                      </span>
                      <span className={`small ${r.lastMonthContribution < 0 ? 'bad' : ''}`}>
                        Lãi đóng góp tháng trước {usd(r.lastMonthContribution)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <section className="panel">
          <h2>Thị phần thành phố</h2>
          <CityShareDonut snap={snap} />
        </section>
        <AlertsPanel snap={snap} />
      </div>
      <EventsPanel snap={snap} />
    </main>
  );
}
