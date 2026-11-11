import { money, QUALITY_TIERS, type QualityTier } from '@game/sim-core';
import type { Snapshot } from '../sim/snapshot';
import { useUi } from '../store';
import { CUBIC_TRACK, fromCubicPosition, toCubicPosition } from '../ui/sliderScale';
import { int, pct, usd } from '../format';
import { Slider } from './Slider';
import { StoreDetail } from './StoreDetail';

export function StoreTable({ snap }: { snap: Snapshot }) {
  const { send, inspect, inspectedStore } = useUi();
  const companyId = snap.player.id;
  const marketing = snap.limits.marketing;
  return (
    <section>
      <div className="company-controls">
        <div className="grow">
          <Slider
            id="slider-marketing"
            label="Ngân sách marketing / tháng"
            value={snap.pending.marketingBudgetMonthly ?? snap.player.marketingBudgetMonthly}
            {...marketing}
            scale={{
              track: CUBIC_TRACK,
              toPosition: (v) => toCubicPosition(v, marketing.max),
              fromPosition: (p) => fromCubicPosition(p, marketing.max, marketing.step),
            }}
            format={(v) => usd(money(v))}
            onCommit={(monthly) =>
              send({
                type: 'command',
                command: { type: 'SetMarketingBudget', companyId, payload: { monthly: money(monthly) } },
              })
            }
          />
        </div>
        <label>
          Chất lượng{' '}
          <select
            id="quality-tier"
            aria-label="Chất lượng"
            value={snap.player.qualityTier}
            onChange={(e) => {
              const tier = QUALITY_TIERS.find((t): t is QualityTier => t === e.target.value);
              if (tier)
                send({ type: 'command', command: { type: 'SetQualityTier', companyId, payload: { tier } } });
            }}
          >
            {QUALITY_TIERS.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
      </div>
      {snap.stores.length === 0 ? (
        <p className="muted">Bạn chưa có cửa hàng nào. Chọn một quận trên bản đồ để mở.</p>
      ) : (
        <div className="table-wrap">
          <table className="stores">
            <thead>
              <tr>
                <th>Quận</th>
                <th>Giá</th>
                <th>Staff</th>
                <th>Lương/tháng</th>
                <th>Khách/ngày</th>
                <th>Utilization</th>
                <th>Phục vụ (W)</th>
                <th>Lãi đóng góp tháng trước</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {snap.stores.map((r) => {
                const p = snap.pending.stores[r.id] ?? {};
                return (
                  <tr
                    key={r.id}
                    data-testid={`store-${r.id}`}
                    className={r.id === inspectedStore ? 'selected' : ''}
                  >
                    <td>{r.districtId.toUpperCase()}</td>
                    <td className="num" data-testid={`price-${r.id}`}>
                      {usd(r.price)}
                      <Pending value={p.price} current={r.price} format={usd} />
                    </td>
                    <td className="num">
                      {r.staff}
                      <Pending value={p.staff} current={r.staff} format={String} />
                    </td>
                    <td className="num">
                      {usd(r.wageMonthly)}
                      <Pending value={p.wageMonthly} current={r.wageMonthly} format={usd} />
                    </td>
                    <td className="num">{int(r.servedToday)}</td>
                    <td className="num">{pct(r.utilizationToday, 0)}</td>
                    <td className="num">{r.serviceLevel.toFixed(2)}</td>
                    <td className={`num ${r.lastMonthContribution < 0 ? 'bad' : ''}`}>
                      {usd(r.lastMonthContribution)}
                    </td>
                    <td className="actions">
                      <button
                        type="button"
                        data-testid={`inspect-${r.id}`}
                        onClick={() => inspect(r.id === inspectedStore ? null : r.id)}
                      >
                        {r.id === inspectedStore ? 'Ẩn' : 'Điều hành'}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          send({
                            type: 'command',
                            command: { type: 'CloseStore', companyId, payload: { storeId: r.id } },
                          })
                        }
                      >
                        Đóng
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <StoreDetail snap={snap} />
    </section>
  );
}

/** Giá trị đã đặt nhưng chưa áp dụng (game đang dừng hoặc chờ tick kế tiếp). */
function Pending<T>({
  value,
  current,
  format,
}: {
  value: T | undefined;
  current: T;
  format: (v: T) => string;
}) {
  if (value === undefined || value === current) return null;
  return (
    <span className="pending" title="Áp dụng từ đầu ngày mai">
      {' '}
      → {format(value)}
    </span>
  );
}
