import { money, type UtilityPart } from '@game/sim-core';
import type { Snapshot } from '../sim/snapshot';
import { useUi } from '../store';
import { int, pct, usd } from '../format';
import { DayChart, PriceCurve } from './Charts';
import { Slider } from './Slider';

const SEGMENT_LABEL: Record<string, string> = {
  office: 'dân văn phòng',
  students: 'sinh viên',
  premium: 'khách cao cấp',
  other: 'khách khác',
};
const PART_LABEL: Record<UtilityPart, string> = {
  quality: 'chất lượng',
  price: 'giá',
  brand: 'thương hiệu',
  distance: 'khoảng cách',
  service: 'phục vụ',
};
const segmentName = (id: string) => SEGMENT_LABEL[id] ?? id;

/** Panel chi tiết cửa hàng: thanh kéo có ước tính trực tiếp, đường cong giá, 14 ngày, vì sao cầu như vậy. */
export function StoreDetail({ snap }: { snap: Snapshot }) {
  const { send, inspect, requestPreview, clearPreview, preview } = useUi();
  const view = snap.inspection;
  if (!view) return null;
  const row = snap.stores.find((r) => r.id === view.storeId);
  if (!row) return null;
  const companyId = snap.player.id;
  const pending = snap.pending.stores[view.storeId] ?? {};
  const price = pending.price ?? row.price;
  const staff = pending.staff ?? row.staff;
  const wageMonthly = pending.wageMonthly ?? row.wageMonthly;
  const preview$ = (change: Parameters<typeof requestPreview>[1]) =>
    requestPreview(view.storeId, { ...pending, ...change });
  const names = Object.fromEntries(snap.companies.map((c) => [c.id, c.kind === 'player' ? 'Bạn' : c.name]));
  const estimate = preview ?? view.current;
  const { report } = view;
  const focus = report.focus;
  const command = (cmd: Parameters<typeof send>[0]) => send(cmd);

  return (
    <section className="store-detail" aria-labelledby="detail-title">
      <header className="detail-head">
        <h3 id="detail-title">Cửa hàng quận {row.districtId.toUpperCase()}</h3>
        <span className="muted">
          tinh thần {pct(view.morale, 0)} · kỹ năng {pct(view.skill, 0)} · phục vụ{' '}
          {row.serviceLevel.toFixed(2)}
        </span>
        <button type="button" onClick={() => inspect(null)} aria-label="Đóng chi tiết">
          Đóng
        </button>
      </header>

      <div className="detail-grid">
        <div className="levers">
          <Slider
            id="slider-price"
            label="Giá bán"
            value={price}
            {...snap.limits.price}
            format={(v) => usd(money(v))}
            onPreview={(v) => preview$({ price: money(v) })}
            onRelease={clearPreview}
            onCommit={(v) =>
              command({
                type: 'command',
                command: { type: 'SetPrice', companyId, payload: { storeId: view.storeId, price: money(v) } },
              })
            }
          />
          <Slider
            id="slider-staff"
            label="Nhân viên"
            value={staff}
            {...snap.limits.staff}
            format={(v) => `${v} người`}
            onPreview={(v) => preview$({ staff: v })}
            onRelease={clearPreview}
            onCommit={(v) =>
              command({
                type: 'command',
                command: { type: 'SetStaff', companyId, payload: { storeId: view.storeId, staff: v } },
              })
            }
          />
          <Slider
            id="slider-wage"
            label="Lương / người / tháng"
            value={wageMonthly}
            {...snap.limits.wage}
            format={(v) => usd(money(v))}
            onPreview={(v) => preview$({ wageMonthly: money(v) })}
            onRelease={clearPreview}
            onCommit={(v) =>
              command({
                type: 'command',
                command: {
                  type: 'SetWage',
                  companyId,
                  payload: { storeId: view.storeId, wageMonthly: money(v) },
                },
              })
            }
          />
          {Object.keys(pending).length > 0 && (
            <p className="small pending" data-testid="pending-note">
              ⏳ Thay đổi đã đặt, áp dụng từ đầu ngày mai.
            </p>
          )}
          <dl className="estimate" data-testid="estimate" aria-live="polite">
            <div>
              <dt>Khách/ngày (kỳ vọng)</dt>
              <dd>{int(estimate.expectedDemand)}</dd>
            </div>
            <div>
              <dt>Phục vụ được</dt>
              <dd>
                {int(estimate.served)} / công suất {int(estimate.capacity)}
              </dd>
            </div>
            <div>
              <dt>Lãi đóng góp/ngày</dt>
              <dd
                className={estimate.contributionPerDay < 0 ? 'bad' : ''}
                data-testid="estimate-contribution"
              >
                {usd(estimate.contributionPerDay)}
              </dd>
            </div>
            <div>
              <dt>Tinh thần hướng tới</dt>
              <dd>{pct(estimate.moraleTarget, 0)}</dd>
            </div>
          </dl>
          <p className="muted small">
            {preview ? 'Đang thử — thả tay để áp dụng. ' : ''}Ước tính kỳ vọng: đối thủ giữ nguyên, chưa tính
            nhiễu hằng ngày.
          </p>
        </div>

        <div className="charts-col">
          <PriceCurve curve={view.curve} current={row.price} preview={preview ? preview.price : null} />
          <DayChart days={view.recentDays} />
        </div>
      </div>

      <div className="why">
        <h4>Vì sao cầu như vậy</h4>
        <p>
          ≈ {int(report.expectedDemand)} khách/ngày kỳ vọng. Theo phân khúc:{' '}
          {report.bySegment
            .map((s) => `${segmentName(s.segmentId)} ${int(s.demand)} (${pct(s.share)} số lượt trong tầm)`)
            .join(' · ')}
          .
        </p>
        <p>
          Đến từ quận:{' '}
          {report.byOrigin.map((o) => `${o.districtId.toUpperCase()} ${int(o.demand)}`).join(' · ')}.
          {report.lostToday > 0.5 && <> Hôm nay mất {int(report.lostToday)} khách vì hết công suất.</>}
        </p>
        {focus?.rival ? (
          <p data-testid="gap-summary">
            Ở nhóm khách lớn nhất ({segmentName(focus.segmentId)} quận {focus.originId.toUpperCase()}), đối
            thủ mạnh nhất là <b>{names[focus.rival.companyId] ?? focus.rival.companyId}</b>
            {focus.gaps.length > 0 ? (
              <>
                . Bạn đang thua về{' '}
                {focus.gaps
                  .slice(0, 3)
                  .map((g) => `${PART_LABEL[g.part]} (≈ ${int(g.customers)} khách/ngày)`)
                  .join(', ')}
                .
              </>
            ) : (
              <>, nhưng bạn đang hơn họ ở mọi yếu tố.</>
            )}
          </p>
        ) : (
          <p>Chưa có đối thủ nào cạnh tranh trực tiếp ở nhóm khách lớn nhất.</p>
        )}
        {report.rivals.length > 0 && (
          <p className="muted">
            Đối thủ chia khách nhiều nhất:{' '}
            {report.rivals
              .map(
                (r) =>
                  `${names[r.companyId] ?? r.companyId} ở ${r.districtId.toUpperCase()} (${int(r.overlap)}/ngày)`,
              )
              .join(' · ')}
          </p>
        )}
      </div>

      {view.history.length > 0 && (
        <div className="table-wrap">
          <table className="kv history">
            <thead>
              <tr>
                <th>Tháng trước…</th>
                <th>Khách/ngày</th>
                <th>Utilization</th>
                <th>Doanh thu</th>
                <th>Lãi đóng góp</th>
              </tr>
            </thead>
            <tbody>
              {[...view.history].reverse().map((m, i) => (
                <tr key={i}>
                  <td>{i === 0 ? 'gần nhất' : `−${i}`}</td>
                  <td className="num">{m.days > 0 ? int(m.served / m.days) : '—'}</td>
                  <td className="num">{m.capacity > 0 ? pct(m.served / m.capacity, 0) : '—'}</td>
                  <td className="num">{usd(m.revenue)}</td>
                  <td className={`num ${m.contribution < 0 ? 'bad' : ''}`}>{usd(m.contribution)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
