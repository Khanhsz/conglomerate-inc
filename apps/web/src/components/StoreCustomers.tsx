import { REVIEW_CRITERIA, type ReviewCriterion } from '@game/sim-core';
import type { Snapshot } from '../sim/snapshot';
import { companyStyle, int } from '../format';
import { Donut, StarRating } from './Parts';

const CRITERION: { readonly [C in ReviewCriterion]: string } = {
  price: 'Giá',
  product: 'Sản phẩm',
  service: 'Phục vụ',
  atmosphere: 'Không gian',
};

/** Đánh giá của khách và thị phần khu vực (M1.7 U4). */
export function StoreCustomers({ snap }: { snap: Snapshot }) {
  const view = snap.inspection;
  if (!view) return null;
  const index = new Map(snap.companies.map((c, i) => [c.id, i]));
  const names = new Map(snap.companies.map((c) => [c.id, c.kind === 'player' ? 'Bạn' : c.name]));
  const r = view.reviews;
  return (
    <div className="customers">
      {r && (
        <section className="card reviews" data-testid="store-reviews">
          <h3>Đánh giá của khách</h3>
          <div className="reviews-overall">
            <strong>{r.overall.toFixed(1)}</strong>
            <StarRating stars={Math.round(r.overall * 2) / 2} label="Tổng" showValue={false} />
            <span className="small muted">dựa trên {int(r.basedOn)} khách tháng trước</span>
          </div>
          <ul className="reviews-list">
            {REVIEW_CRITERIA.map((c) => (
              <li key={c}>
                <span>{CRITERION[c]}</span>
                <StarRating stars={r.stars[c]} label={CRITERION[c]} />
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="card">
        <h3>Thị phần khu vực</h3>
        <Donut
          testId="area-share"
          slices={view.area.map((a) => ({
            label: a.companyId === null ? 'Không mua' : (names.get(a.companyId) ?? a.companyId),
            value: a.share,
            color: a.companyId === null ? 'var(--outside)' : companyStyle(index.get(a.companyId) ?? 0).color,
          }))}
        />
        <p className="small muted">
          Lượt mua của dân quận này, gồm cả cửa hàng các quận lân cận trong tầm đi.
        </p>
      </section>
    </div>
  );
}
