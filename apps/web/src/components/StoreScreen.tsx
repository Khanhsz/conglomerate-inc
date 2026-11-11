import { DAYS_PER_MONTH } from '@game/sim-core';
import { useState } from 'react';
import type { InspectionView } from '../sim/inspection';
import type { Snapshot } from '../sim/snapshot';
import { STORE_TABS, useUi, type StoreTab } from '../store';
import { int, monthLabel, signedUsd, usd } from '../format';
import { ColumnChart } from './ColumnChart';
import { MomTable } from './MomTable';
import { storeAdvice } from './advisors';
import { AdvisorStrip, KpiPair } from './Parts';
import { StorePlan } from './Plans';
import { ScreenShell } from './ScreenShell';
import { AmenityCards } from './AmenityCards';
import { StoreCustomers } from './StoreCustomers';
import { StoreDetail } from './StoreDetail';

const LABEL: { readonly [T in StoreTab]: string } = {
  ops: 'Vận hành',
  product: 'Sản phẩm',
  marketing: 'Marketing',
  finance: 'Tài chính',
};

/** Màn hình một cửa hàng (M1.7): mỗi cửa hàng là một đơn vị kinh doanh. */
export function StoreScreen({ snap, storeId, tab }: { snap: Snapshot; storeId: string; tab: StoreTab }) {
  const { openStore, openMap } = useUi();
  const row = snap.stores.find((r) => r.id === storeId);
  const close = () => openMap();
  if (!row) {
    return (
      <section className="screen" data-testid="store-screen">
        <p className="muted">Cửa hàng này đã đóng.</p>
        <button type="button" onClick={close}>
          Về bản đồ
        </button>
      </section>
    );
  }
  return (
    <ScreenShell
      title={`Cửa hàng quận ${row.districtId.toUpperCase()}`}
      subtitle={`${storeId} · ${int(row.servedToday)} khách hôm nay · phục vụ ${row.serviceLevel.toFixed(2)}`}
      testId="store-screen"
      tabs={STORE_TABS.map((id) => ({ id, label: LABEL[id] }))}
      active={tab}
      tabTestPrefix="store-tab-"
      onTab={(t) => openStore(storeId, t)}
      onClose={close}
      advisor={<StoreAdvisor snap={snap} storeId={storeId} />}
    >
      <StorePlan
        staff={row.staff}
        capacity={snap.inspection?.storeId === storeId ? snap.inspection.report.capacityToday : 0}
        served={row.servedToday}
        lost={snap.inspection?.storeId === storeId ? snap.inspection.report.lostToday : 0}
        amenities={
          snap.inspection?.storeId === storeId
            ? snap.inspection.amenities.filter((x) => x.on).map((x) => x.name)
            : []
        }
      />
      {tab === 'ops' && <StoreKpis snap={snap} storeId={storeId} />}
      {tab === 'ops' && <StoreCustomers snap={snap} />}
      {tab === 'ops' && <StoreDetail snap={snap} />}
      {tab === 'product' && (
        <section className="hq-section">
          <p>
            Giá bán hiện tại <b>{usd(row.price)}</b> (chỉnh ở tab Vận hành, có ước tính trực tiếp). Chất lượng{' '}
            <b>{snap.player.qualityTier}</b> đặt ở Trụ sở cho cả chuỗi.
          </p>
          <p className="small muted">
            Menu nhiều sản phẩm và giá riêng từng món sẽ có khi mở phòng Sản phẩm.
          </p>
        </section>
      )}
      {tab === 'marketing' && <AmenityCards snap={snap} storeId={storeId} />}
      {tab === 'finance' && <StoreFinance snap={snap} storeId={storeId} />}
    </ScreenShell>
  );
}

function StoreFinance({ snap, storeId }: { snap: Snapshot; storeId: string }) {
  const send = useUi((s) => s.send);
  const [confirm, setConfirm] = useState(false);
  const view = snap.inspection;
  const historyMom = view?.storeId === storeId ? view.historyMom : null;
  return (
    <section className="hq-section">
      {view?.storeId === storeId && <StoreMonthSummary view={view} />}
      <h3>Kết quả tháng này so với tháng trước</h3>
      {historyMom === null ? (
        <p className="muted">Chưa có tháng nào chốt sổ.</p>
      ) : (
        <MomTable table={historyMom} testId="store-history" rowTestId="store-mom" />
      )}
      <div className="danger-zone">
        {confirm ? (
          <>
            <span className="bad">
              Đóng cửa hàng: ghi giảm giá trị còn lại và trả phí chấm dứt 3 tháng thuê.
            </span>
            <button
              type="button"
              data-testid="close-store-confirm"
              onClick={() => {
                send({
                  type: 'command',
                  command: { type: 'CloseStore', companyId: snap.player.id, payload: { storeId } },
                });
                setConfirm(false);
              }}
            >
              Xác nhận đóng
            </button>
            <button type="button" onClick={() => setConfirm(false)}>
              Thôi
            </button>
          </>
        ) : (
          <button type="button" className="link" data-testid="close-store" onClick={() => setConfirm(true)}>
            Đóng cửa hàng…
          </button>
        )}
      </div>
    </section>
  );
}

function StoreAdvisor({ snap, storeId }: { snap: Snapshot; storeId: string }) {
  const a = storeAdvice(snap, storeId);
  return (
    <AdvisorStrip role="store" tone={a.tone}>
      {a.text}
    </AdvisorStrip>
  );
}

/** Khách/ngày 7 ngày gần nhất so với 7 ngày trước đó; lãi đóng góp tháng gần nhất so với tháng trước. */
function StoreKpis({ snap, storeId }: { snap: Snapshot; storeId: string }) {
  const view = snap.inspection;
  if (!view || view.storeId !== storeId) return null;
  const days = view.recentDays;
  const avg = (xs: readonly { served: number }[]) =>
    xs.length > 0 ? xs.reduce((a, d) => a + d.served, 0) / xs.length : null;
  const week = avg(days.slice(-7));
  const before = days.length >= 14 ? avg(days.slice(-14, -7)) : null;
  const lastMonth = view.history[view.history.length - 1];
  const diff = week !== null && before !== null ? week - before : null;
  return (
    <KpiPair
      items={[
        {
          label: 'Khách / ngày (7 ngày)',
          value: week === null ? '—' : int(week),
          delta:
            diff === null
              ? null
              : { text: `${diff >= 0 ? '+' : ''}${int(diff)}`, tone: diff >= 0 ? 'good' : 'bad' },
          series: days.map((d) => d.served),
          testId: 'kpi-customers',
        },
        {
          label: 'Lãi đóng góp tháng trước',
          value: lastMonth ? usd(lastMonth.contribution) : '—',
          delta:
            view.contributionDelta === null
              ? null
              : {
                  text: signedUsd(view.contributionDelta),
                  tone: view.contributionDelta >= 0 ? 'good' : 'bad',
                },
          series: view.history.map((m) => m.contribution),
        },
      ]}
    />
  );
}

const CHART_MONTHS = 5;

/** Tháng đang chạy (chưa chốt sổ) ở hai ô nổi bật, rồi doanh thu và lợi nhuận 5 tháng đã chốt gần nhất. */
function StoreMonthSummary({ view }: { view: InspectionView }) {
  const mtd = view.monthToDate;
  const months = view.history.slice(-CHART_MONTHS);
  const last = view.history[view.history.length - 1];
  const profitable = mtd.contribution >= 0;
  return (
    <>
      <div className="mtd-tiles" data-testid="store-mtd">
        <div className="mtd-tile series-1-edge">
          <span className="mtd-label">Doanh thu tháng này</span>
          <strong className="mtd-value" data-testid="mtd-revenue" data-cents={mtd.revenue}>
            {usd(mtd.revenue)}
          </strong>
          <span className="mtd-sub">
            {monthLabel(mtd.month)} · {mtd.days}/{DAYS_PER_MONTH} ngày · chưa chốt sổ
          </span>
          {last && <span className="mtd-sub muted">Cả tháng trước: {usd(last.revenue)}</span>}
        </div>
        <div className="mtd-tile series-2-edge">
          <span className="mtd-label">Lợi nhuận tháng này</span>
          <strong className="mtd-value" data-testid="mtd-profit" data-cents={mtd.contribution}>
            {usd(mtd.contribution)}
          </strong>
          <span className="mtd-sub">
            <span className={profitable ? 'chip chip-ok' : 'chip chip-bad'}>
              {profitable ? 'Đang lãi' : 'Đang lỗ'}
            </span>
            <span> nếu chốt sổ hôm nay</span>
          </span>
          {last && <span className="mtd-sub muted">Cả tháng trước: {usd(last.contribution)}</span>}
        </div>
      </div>
      {months.length > 0 ? (
        <ColumnChart
          title={`Doanh thu và lợi nhuận ${months.length} tháng gần nhất (đã chốt sổ)`}
          labels={months.map((m) => monthLabel(m.month))}
          series={[
            { label: 'Doanh thu', cls: 'series-1', values: months.map((m) => m.revenue) },
            { label: 'Lợi nhuận', cls: 'series-2', values: months.map((m) => m.contribution) },
          ]}
          testId="store-month-chart"
        />
      ) : (
        <p className="muted small">Biểu đồ 5 tháng hiện khi có tháng đầu tiên chốt sổ.</p>
      )}
      <p className="small muted">
        Lợi nhuận = lãi đóng góp của cửa hàng: doanh thu trừ giá vốn, lương (gồm đào tạo, phúc lợi, thưởng),
        thuê và tiện ích; chưa trừ khấu hao và chi phí trụ sở.
      </p>
    </>
  );
}
