import type { Snapshot } from '../sim/snapshot';
import { useUi } from '../store';
import { companyStyle, int, usd } from '../format';

export function CityMap({ snap }: { snap: Snapshot }) {
  const { selectedDistrict, selectDistrict, send } = useUi();
  const index = new Map(snap.companies.map((c, i) => [c.id, i]));
  const selected = snap.districts.find((d) => d.id === selectedDistrict);
  const canOpen = snap.player.status === 'active';
  return (
    <section className="panel map-panel">
      <h2>Bản đồ {snap.city.name}</h2>
      <div className="grid" style={{ gridTemplateColumns: `repeat(${snap.city.gridW}, 1fr)` }}>
        {[...snap.districts]
          .sort((a, b) => a.y - b.y || a.x - b.x)
          .map((d) => (
            <button
              key={d.id}
              data-testid={`district-${d.id}`}
              className={`district ${d.id === selectedDistrict ? 'selected' : ''}`}
              onClick={() => selectDistrict(d.id)}
            >
              <span className="district-name">{d.id.toUpperCase()}</span>
              <span className="muted">{int(d.pop)} dân</span>
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
      {selected ? (
        <div className="district-panel">
          <p>
            Quận <b>{selected.id.toUpperCase()}</b> · {int(selected.pop)} dân · thuê{' '}
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
        <p className="muted">Bấm một quận để xem và mở cửa hàng.</p>
      )}
      <p className="legend">
        {snap.companies.map((c, i) => {
          const style = companyStyle(i);
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
