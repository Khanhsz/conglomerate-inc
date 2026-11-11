import type { Snapshot } from '../sim/snapshot';
import { useUi } from '../store';
import { usd } from '../format';
import { segmentName } from '../labels';

/** Tiện ích cửa hàng (M1.7 U5, economic-model §21): bật / tắt, mỗi lần bật trả phí lắp đặt. */
export function AmenityCards({ snap, storeId }: { snap: Snapshot; storeId: string }) {
  const send = useUi((s) => s.send);
  const view = snap.inspection;
  if (!view || view.storeId !== storeId) return null;
  return (
    <section className="hq-section">
      <h3>Tiện ích cửa hàng</h3>
      <p className="small muted">
        Mỗi tiện ích làm cửa hàng hấp dẫn hơn với một số nhóm khách và nâng điểm "Không gian". Bật lần nào trả
        phí lắp đặt lần đó; chi phí tháng tính theo ngày đang bật.
      </p>
      <div className="amenities">
        {view.amenities.map((a) => (
          <article key={a.id} className={`card amenity ${a.on ? 'on' : ''}`} data-testid={`amenity-${a.id}`}>
            <h3>{a.name}</h3>
            <p className="small">Thu hút: {a.appealsTo.map(segmentName).join(', ') || 'mọi nhóm một chút'}</p>
            <p className="small muted">
              Lắp đặt {usd(a.setupCost)} · {usd(a.monthlyCost)}/tháng
            </p>
            <button
              type="button"
              className={a.on ? '' : 'primary'}
              data-testid={`amenity-toggle-${a.id}`}
              aria-pressed={a.on}
              onClick={() =>
                send({
                  type: 'command',
                  command: {
                    type: 'SetStoreAmenity',
                    companyId: snap.player.id,
                    payload: { storeId, amenity: a.id, on: !a.on },
                  },
                })
              }
            >
              {a.on ? 'Tắt' : 'Bật'}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
