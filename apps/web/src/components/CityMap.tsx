import type { Zone } from '@game/sim-core';
import { districtLabel, ZONE_LABEL } from '../sim/places';
import type { Snapshot } from '../sim/snapshot';
import { useUi } from '../store';
import { companyStyle, int, usd } from '../format';

const ZONE_SHORT: { readonly [Z in Zone]: string } = { budget: 'BD', central: 'TT', premium: 'CC' };
/** Lưới từ 5 cột trở lên dùng ô gọn (không hiện dân số trong ô) để vừa màn hình điện thoại. */
const DENSE_FROM_COLUMNS = 5;

/** Bản đồ một thành phố: lưới địa điểm theo tọa độ (cho phép ô trống), nhãn khu, cửa hàng theo công ty. */
export function CityMap({ snap }: { snap: Snapshot }) {
  const { selectedDistrict, selectDistrict, viewCity, send } = useUi();
  const index = new Map(snap.companies.map((c) => [c.id, c.colorIndex]));
  const selected = snap.districts.find((d) => d.id === selectedDistrict);
  const canOpen = snap.player.status === 'active';
  const dense = snap.city.gridW >= DENSE_FROM_COLUMNS;
  const multiZone = new Set(snap.districts.map((d) => d.zone)).size > 1;
  const present = new Set(snap.districts.flatMap((d) => d.stores.map((s) => s.companyId)));
  return (
    <section className="panel map-panel">
      <h2>Bản đồ {snap.city.name}</h2>
      {snap.cities.length > 1 && (
        <div className="chips city-chips" role="group" aria-label="Thành phố">
          {snap.cities.map((c) => (
            <button
              key={c.id}
              type="button"
              className="chip-button"
              aria-pressed={c.id === snap.city.id}
              data-testid={`city-${c.id}`}
              title={`${int(c.pop)} dân · ${c.rivals} đối thủ`}
              onClick={() => viewCity(c.id)}
            >
              {c.name}
              {c.ownStores > 0 && <span className="city-own"> ◆{c.ownStores}</span>}
            </button>
          ))}
        </div>
      )}
      <div
        className={`grid city-grid ${dense ? 'dense' : ''}`}
        style={{ gridTemplateColumns: `repeat(${snap.city.gridW}, minmax(0, 1fr))` }}
        data-testid="city-grid"
      >
        {snap.districts.map((d) => (
          <button
            key={d.id}
            data-testid={`district-${d.id}`}
            className={`district zone-${d.zone} ${d.id === selectedDistrict ? 'selected' : ''}`}
            style={{ gridColumn: d.x + 1, gridRow: d.y + 1 }}
            title={`${districtLabel(d.id)} · ${ZONE_LABEL[d.zone]} · ${int(d.pop)} dân`}
            onClick={() => selectDistrict(d.id)}
          >
            <span className="district-name">
              {districtLabel(d.id)}
              {multiZone && !dense && <span className="zone-tag">{ZONE_SHORT[d.zone]}</span>}
            </span>
            {!dense && <span className="muted">{int(d.pop)} dân</span>}
            <span className="glyphs">
              {d.stores.flatMap((s) => {
                const style = companyStyle(index.get(s.companyId) ?? 0);
                return Array.from({ length: s.count }, (_, k) => (
                  <span key={`${s.companyId}-${k}`} style={{ color: style.color }}>
                    {style.glyph}
                  </span>
                ));
              })}
            </span>
          </button>
        ))}
      </div>
      {multiZone && (
        <p className="legend zone-legend">
          {(['budget', 'central', 'premium'] as const).map((z) => (
            <span key={z}>
              <span className={`zone-swatch zone-${z}`} aria-hidden="true" /> {ZONE_LABEL[z]}
            </span>
          ))}
        </p>
      )}
      {selected ? (
        <div className="district-panel">
          <p>
            <b>{districtLabel(selected.id)}</b>
            {multiZone && <> · khu {ZONE_LABEL[selected.zone]}</>} · {int(selected.pop)} dân · thuê{' '}
            {usd(selected.rentMonthly)}/tháng
          </p>
          <button
            className="primary"
            data-testid="open-store"
            disabled={!canOpen}
            onClick={() =>
              send({
                type: 'command',
                command: {
                  type: 'OpenStore',
                  companyId: snap.player.id,
                  payload: { districtId: selected.id },
                },
              })
            }
          >
            Mở cửa hàng (capex {usd(selected.capex)})
          </button>
        </div>
      ) : (
        <p className="muted">Bấm một địa điểm để xem và mở cửa hàng.</p>
      )}
      <p className="legend">
        {snap.companies.map((c) => {
          if (c.kind !== 'player' && !present.has(c.id)) return null;
          const style = companyStyle(c.colorIndex);
          return (
            <span key={c.id}>
              <span style={{ color: style.color }}>{style.glyph}</span> {c.kind === 'player' ? 'Bạn' : c.name}
            </span>
          );
        })}
      </p>
    </section>
  );
}
