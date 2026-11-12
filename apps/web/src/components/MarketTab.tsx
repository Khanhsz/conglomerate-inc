import type { CompanyStatus } from '@game/sim-core';
import { useState } from 'react';
import type { CompanyView, RivalPace, Snapshot } from '../sim/snapshot';
import { companyStyle, monthLabel, pct, usd } from '../format';
import { REACH_LABEL, TIER_STYLE } from '../labels';
import { Donut } from './Parts';

const STATUS_LABEL: { readonly [S in CompanyStatus]: readonly [string, string] } = {
  active: ['đang hoạt động', 'ok'],
  distress: ['khó khăn', 'warn'],
  bankrupt: ['phá sản', 'bad'],
  exited: ['đã rút', 'info'],
};
const PACE_LABEL: { readonly [P in RivalPace]: string } = {
  cautious: 'mở rộng thận trọng',
  steady: 'mở rộng vừa phải',
  fast: 'mở rộng nhanh',
};
const FILTERS = ['here', 'all', 'gone'] as const;
type Filter = (typeof FILTERS)[number];
const isGone = (c: CompanyView) => c.status === 'bankrupt' || c.status === 'exited';

/** Thị phần của thành phố đang xem (donut) và hồ sơ công khai của các đối thủ (M1.8). */
export function MarketTab({ snap }: { snap: Snapshot }) {
  const [filter, setFilter] = useState<Filter>('here');
  const rivals = snap.companies.filter((c) => c.kind === 'ai');
  const shown = rivals.filter((c) =>
    filter === 'here' ? c.storesHere > 0 && !isGone(c) : filter === 'gone' ? isGone(c) : !isGone(c),
  );
  const label: { readonly [F in Filter]: string } = {
    here: `Ở ${snap.city.name} (${rivals.filter((c) => c.storesHere > 0 && !isGone(c)).length})`,
    all: `Đang hoạt động (${rivals.filter((c) => !isGone(c)).length})`,
    gone: `Đã rời thị trường (${rivals.filter(isGone).length})`,
  };
  return (
    <section>
      <h3>Thị phần ở {snap.city.name}</h3>
      <CityShareDonut snap={snap} />
      <h3>Đối thủ</h3>
      <div className="chips" role="group" aria-label="Lọc đối thủ">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            className="chip-button"
            aria-pressed={filter === f}
            data-testid={`rivals-${f}`}
            onClick={() => setFilter(f)}
          >
            {label[f]}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="muted">Không có đối thủ nào trong nhóm này.</p>
      ) : (
        <div className="rivals" data-testid="rival-list">
          {shown.map((c) => (
            <RivalCard key={c.id} snap={snap} company={c} />
          ))}
        </div>
      )}
      <p className="small muted">
        Hồ sơ chỉ gồm thông tin công khai. Doanh thu là con số ước tính làm tròn; lợi nhuận và tiền mặt của
        đối thủ không lộ ra.
      </p>
    </section>
  );
}

function RivalCard({ snap, company: c }: { snap: Snapshot; company: CompanyView }) {
  const style = companyStyle(c.colorIndex);
  const d = c.dossier;
  const [status, tone] = STATUS_LABEL[c.status];
  return (
    <article className="card rival" data-testid={`rival-${c.id}`}>
      <h3>
        <span style={{ color: style.color }} aria-hidden="true">
          {style.glyph}
        </span>{' '}
        {c.name} <span className={`chip chip-${tone}`}>{status}</span>
      </h3>
      {d && (
        <p className="small rival-style">
          <span className="chip chip-info">{TIER_STYLE[d.qualityTier]}</span>{' '}
          <span className="chip chip-info">{REACH_LABEL[d.reach]}</span>{' '}
          <span className="chip chip-info">{PACE_LABEL[d.pace]}</span>
        </p>
      )}
      <dl className="kv">
        {d && (
          <>
            <div className="kv-row">
              <dt>Gia nhập</dt>
              <dd>{d.foundedDay === 0 ? 'từ đầu ván' : monthLabel(Math.floor(d.foundedDay / 30))}</dd>
            </div>
            <div className="kv-row">
              <dt>Thành phố nhà</dt>
              <dd>{d.homeCity}</dd>
            </div>
            {snap.cities.length > 1 && (
              <div className="kv-row">
                <dt>Đang có mặt ở</dt>
                <dd>{d.cities.length === 0 ? '—' : d.cities.join(', ')}</dd>
              </div>
            )}
          </>
        )}
        <div className="kv-row">
          <dt>Cửa hàng</dt>
          <dd>
            {c.storeCount}
            {snap.cities.length > 1 && ` (ở ${snap.city.name}: ${c.storesHere})`}
          </dd>
        </div>
        <div className="kv-row">
          <dt>Giá trung bình</dt>
          <dd>{c.avgPrice === null ? '—' : usd(c.avgPrice)}</dd>
        </div>
        <div className="kv-row">
          <dt>Thị phần ở {snap.city.name}</dt>
          <dd>{pct(c.marketShare)}</dd>
        </div>
        <div className="kv-row">
          <dt>Nhận biết thương hiệu</dt>
          <dd>{pct(c.brandAwareness)}</dd>
        </div>
        {d && (
          <div className="kv-row">
            <dt>Doanh thu tháng (ước tính)</dt>
            <dd>{d.revenueEstimate === null ? '—' : `≈ ${usd(d.revenueEstimate)}`}</dd>
          </div>
        )}
      </dl>
    </article>
  );
}

/** Donut thị phần của thành phố đang xem: công ty có khách ở đây + "không mua" (cầu kỳ vọng). */
export function CityShareDonut({ snap }: { snap: Snapshot }) {
  return (
    <Donut
      testId="city-share"
      slices={[
        ...snap.companies
          .filter((c) => c.kind === 'player' || c.marketShare > 0)
          .map((c) => ({
            label: c.kind === 'player' ? 'Bạn' : c.name,
            value: c.marketShare,
            color: companyStyle(c.colorIndex).color,
          })),
        { label: 'Không mua', value: snap.outsideShare, color: 'var(--outside)' },
      ]}
    />
  );
}
