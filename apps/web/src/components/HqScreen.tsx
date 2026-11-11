import { DEPARTMENT_LABEL, money, OFFICE_SIZE_LABEL, QUALITY_TIERS, type QualityTier } from '@game/sim-core';
import type { Snapshot } from '../sim/snapshot';
import { HQ_TABS, useUi, type HqTab } from '../store';
import { CUBIC_TRACK, fromCubicPosition, toCubicPosition } from '../ui/sliderScale';
import { usd } from '../format';
import { FinanceTab } from './FinanceTab';
import { HrDept } from './HrDept';
import { MarketTab } from './MarketTab';
import { OfficeTab } from './OfficeTab';
import { ScreenShell } from './ScreenShell';
import { Slider } from './Slider';

const LABEL: { readonly [T in HqTab]: string } = {
  office: 'Văn phòng',
  finance: DEPARTMENT_LABEL.finance,
  hr: DEPARTMENT_LABEL.hr,
  product: DEPARTMENT_LABEL.product,
  marketing: DEPARTMENT_LABEL.marketing,
  board: 'Điều hành',
};

/** Màn hình Trụ sở (M1.7): một tab cho văn phòng và mỗi phòng ban. */
export function HqScreen({ snap, tab }: { snap: Snapshot; tab: HqTab }) {
  const { openHq, openMap } = useUi();
  const office = snap.office.office;
  const opened = (d: Exclude<HqTab, 'office'>) =>
    snap.office.departments.find((x) => x.dept === d)?.openedDay !== null;
  return (
    <ScreenShell
      title="Trụ sở"
      subtitle={
        office
          ? `Văn phòng ${OFFICE_SIZE_LABEL[office.size]} · quận ${office.districtId.toUpperCase()}`
          : 'Chưa thuê văn phòng'
      }
      testId="hq-screen"
      tabs={HQ_TABS.map((id) => ({ id, label: LABEL[id], locked: id !== 'office' && !opened(id) }))}
      active={tab}
      tabTestPrefix="tab-"
      onTab={openHq}
      onClose={openMap}
    >
      {tab === 'office' && <OfficeTab snap={snap} />}
      {tab === 'finance' && <FinanceTab snap={snap} />}
      {tab === 'hr' && <HrDept snap={snap} />}
      {tab === 'product' && <ProductHq snap={snap} />}
      {tab === 'marketing' && <MarketingHq snap={snap} />}
      {tab === 'board' && (
        <p className="muted">
          Ban điều hành (C-level tự điều hành các phòng) đang được xây dựng ở bản tiếp theo.
        </p>
      )}
    </ScreenShell>
  );
}

/** Chất lượng (gói nhà cung cấp) là tính năng M1, không cần phòng Sản phẩm. */
function ProductHq({ snap }: { snap: Snapshot }) {
  const send = useUi((s) => s.send);
  const companyId = snap.player.id;
  return (
    <section className="hq-section">
      <label>
        Chất lượng (áp cho mọi cửa hàng){' '}
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
      <p className="small muted">
        Menu nhiều sản phẩm, chọn nhà cung cấp, R&D và đánh giá sao từng món sẽ có khi mở phòng Sản phẩm (bản
        tiếp theo).
      </p>
    </section>
  );
}

/** Ngân sách thương hiệu chung là tính năng M1; kênh theo quận cần phòng Marketing (phase 5). */
function MarketingHq({ snap }: { snap: Snapshot }) {
  const send = useUi((s) => s.send);
  const companyId = snap.player.id;
  const marketing = snap.limits.marketing;
  return (
    <section className="hq-section">
      <Slider
        id="slider-marketing"
        label="Ngân sách thương hiệu / tháng"
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
      <MarketTab snap={snap} />
    </section>
  );
}
