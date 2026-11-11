import { useState } from 'react';
import type { Snapshot } from '../sim/snapshot';
import { STORE_TABS, useUi, type StoreTab } from '../store';
import { int, pct, signedUsd, usd } from '../format';
import { storeAdvice } from './advisors';
import { AdvisorStrip, KpiPair } from './Parts';
import { ScreenShell } from './ScreenShell';
import { StoreDetail } from './StoreDetail';

const LABEL: { readonly [T in StoreTab]: string } = {
  ops: 'Vận hành',
  product: 'Sản phẩm',
  marketing: 'Marketing',
  finance: 'Tài chính',
};

const monthLabel = (m: number) => `N${Math.floor(m / 12) + 1}·T${(m % 12) + 1}`;

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
      {tab === 'ops' && <StoreKpis snap={snap} storeId={storeId} />}
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
      {tab === 'marketing' && (
        <section className="hq-section">
          <p className="small muted">
            Tiện ích cửa hàng (Wi-Fi, ổ cắm, nhạc, lounge) đang được thêm ở bước tiếp theo.
          </p>
        </section>
      )}
      {tab === 'finance' && <StoreFinance snap={snap} storeId={storeId} />}
    </ScreenShell>
  );
}

function StoreFinance({ snap, storeId }: { snap: Snapshot; storeId: string }) {
  const send = useUi((s) => s.send);
  const [confirm, setConfirm] = useState(false);
  const view = snap.inspection;
  const history = view?.storeId === storeId ? view.history : [];
  return (
    <section className="hq-section">
      <h3>Kết quả theo tháng</h3>
      {history.length === 0 ? (
        <p className="muted">Chưa có tháng nào chốt sổ.</p>
      ) : (
        <div className="table-wrap">
          <table className="history" data-testid="store-history">
            <thead>
              <tr>
                <th>Tháng</th>
                <th>Khách/ngày</th>
                <th>Utilization</th>
                <th>Doanh thu</th>
                <th>Giá vốn</th>
                <th>Lương & nhân sự</th>
                <th>Thuê</th>
                <th>Lãi đóng góp</th>
              </tr>
            </thead>
            <tbody>
              {[...history].reverse().map((m) => (
                <tr key={m.month}>
                  <td>{monthLabel(m.month)}</td>
                  <td className="num">{m.days > 0 ? int(m.served / m.days) : '—'}</td>
                  <td className="num">{m.capacity > 0 ? pct(m.served / m.capacity, 0) : '—'}</td>
                  <td className="num">{usd(m.revenue)}</td>
                  <td className="num">{usd(m.cogs)}</td>
                  <td className="num">{usd(m.wagesTotal)}</td>
                  <td className="num">{usd(m.rent)}</td>
                  <td className={`num ${m.contribution < 0 ? 'bad' : ''}`}>{usd(m.contribution)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
