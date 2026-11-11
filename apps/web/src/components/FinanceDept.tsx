import {
  LOAN_TERMS_MONTHS,
  money,
  type AdviceCode,
  type FinanceAdvice,
  type StorePnlLines,
} from '@game/sim-core';
import { useState } from 'react';
import type { Snapshot } from '../sim/snapshot';
import { useUi } from '../store';
import { pct, usd } from '../format';
import { Slider } from './Slider';
import { TrendChart } from './TrendChart';

const monthLabel = (m: number) => `N${Math.floor(m / 12) + 1}·T${(m % 12) + 1}`;

function adviceText(code: AdviceCode, a: FinanceAdvice): string {
  switch (code) {
    case 'noHistory':
      return 'Chưa có tháng nào chốt sổ: ngân hàng chưa xét cho vay.';
    case 'highLeverage':
      return `Nợ đã gần mức ngân hàng chấp nhận (nợ / EBITDA ${a.leverage?.toFixed(2) ?? '—'}). Ưu tiên giảm nợ trước khi vay thêm.`;
    case 'lowDscr':
      return `EBITDA chỉ gấp ${a.dscr?.toFixed(2) ?? '—'}× nghĩa vụ trả nợ năm (dưới 1.5×): dễ thiếu tiền nếu doanh thu giảm.`;
    case 'refinanceCheaper':
      return 'Có khoản vay tái cấp vốn được với lãi thấp hơn (xem bảng bên dưới).';
    case 'overdraftInUse':
      return `Đang dùng thấu chi (lãi ${pct(a.creditLine.overdraftRate, 1)}/năm). Vay kỳ hạn hoặc hạn mức tín dụng rẻ hơn.`;
    case 'creditLineAvailable':
      return `Đủ điều kiện mở hạn mức tín dụng: lãi ${pct(a.creditLine.creditLineRate, 1)} thay vì ${pct(a.creditLine.overdraftRate, 1)}, phí cam kết ${pct(a.creditLine.commitmentFeeAnnual, 1)}/năm trên phần chưa dùng.`;
  }
}

/** Phòng Tài chính (economic-model §19.1): xu hướng, P&L theo cửa hàng, tư vấn, tái cấp vốn, hạn mức tín dụng. */
export function FinanceDept({ snap }: { snap: Snapshot }) {
  const { send, openHq } = useUi();
  const fin = snap.finance;
  if (!fin.open) {
    return (
      <article className="card locked" data-testid="finance-locked">
        <h3>Phòng Tài chính chưa mở</h3>
        <p className="small">
          Mở phòng Tài chính ở tab Văn phòng để xem báo cáo hợp nhất theo cửa hàng, biểu đồ xu hướng, nhận tư
          vấn vay, tái cấp vốn và mở hạn mức tín dụng.
        </p>
        <button type="button" className="link" onClick={() => openHq('office')}>
          Đến Văn phòng →
        </button>
      </article>
    );
  }
  const labels = fin.trend.map((t) => monthLabel(t.month));
  const a = fin.advice;
  return (
    <section className="finance-dept" data-testid="finance-dept">
      <div className="charts">
        <TrendChart
          title="Doanh thu, EBITDA, lợi nhuận ròng theo tháng"
          labels={labels}
          series={[
            { label: 'Doanh thu', cls: 'line-a', values: fin.trend.map((t) => t.revenue) },
            { label: 'EBITDA', cls: 'line-b', values: fin.trend.map((t) => t.ebitda) },
            { label: 'Lợi nhuận ròng', cls: 'line-c', values: fin.trend.map((t) => t.netIncome) },
          ]}
        />
        <TrendChart
          title="Tiền ròng cuối tháng (tiền mặt − thấu chi)"
          labels={labels}
          series={[{ label: 'Tiền ròng', cls: 'line-a', values: fin.trend.map((t) => t.netCash) }]}
        />
      </div>
      {fin.storePnl && <StorePnlTable snap={snap} />}
      <Advisor snap={snap} />
      <CreditLine snap={snap} />
      {a.refinance.length > 0 && (
        <>
          <h3>Tái cấp vốn</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Khoản vay</th>
                  <th>Dư nợ</th>
                  <th>Lãi hiện tại</th>
                  <th>Lãi nếu tái cấp vốn</th>
                  <th>Phí (cộng vào gốc mới)</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {a.refinance.map((r) => (
                  <RefinanceRow
                    key={r.loanId}
                    r={r}
                    onRefinance={(termMonths) =>
                      send({
                        type: 'command',
                        command: {
                          type: 'RefinanceLoan',
                          companyId: snap.player.id,
                          payload: { loanId: r.loanId, termMonths },
                        },
                      })
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function RefinanceRow({
  r,
  onRefinance,
}: {
  r: FinanceAdvice['refinance'][number];
  onRefinance: (termMonths: number) => void;
}) {
  const [term, setTerm] = useState<number>(36);
  const better = r.newRate !== null && r.newRate < r.annualRate;
  return (
    <tr data-testid={`refinance-${r.loanId}`}>
      <td>{r.loanId}</td>
      <td className="num">{usd(r.outstanding)}</td>
      <td className="num">{pct(r.annualRate, 2)}</td>
      <td className={`num ${better ? 'good' : ''}`}>
        {r.newRate === null ? 'bị từ chối' : pct(r.newRate, 2)}
      </td>
      <td className="num">{usd(r.fee)}</td>
      <td className="actions">
        <select aria-label="Kỳ hạn mới" value={term} onChange={(e) => setTerm(Number(e.target.value))}>
          {LOAN_TERMS_MONTHS.map((t) => (
            <option key={t} value={t}>
              {t} tháng
            </option>
          ))}
        </select>
        <button type="button" disabled={r.newRate === null} onClick={() => onRefinance(term)}>
          Tái cấp vốn
        </button>
      </td>
    </tr>
  );
}

const STORE_COLUMNS: readonly (readonly [keyof StorePnlLines, string])[] = [
  ['revenue', 'Doanh thu'],
  ['cogs', 'Giá vốn'],
  ['wages', 'Lương'],
  ['rent', 'Thuê'],
  ['contribution', 'Lãi đóng góp'],
  ['depreciation', 'Khấu hao'],
  ['operatingProfit', 'Lãi sau khấu hao'],
];

function StorePnlTable({ snap }: { snap: Snapshot }) {
  const pnl = snap.finance.storePnl;
  if (!pnl) return null;
  const c = pnl.corporate;
  const corporateCosts = [
    ['Marketing', c.marketing],
    ['Quản trị chung (Admin)', c.admin],
    ['Thuê văn phòng', c.officeRent],
    ['Phòng ban', c.departments],
    ['R&D', c.research],
    ['Thuê khác (phí chấm dứt)', c.rent],
    ['Khấu hao văn phòng', c.depreciation],
    ['Lỗ thanh lý', c.lossOnDisposal],
    ['Lãi vay', c.interest],
    ['Thuế TNDN', c.incomeTax],
  ] as const;
  return (
    <>
      <h3>P&L theo cửa hàng · {monthLabel(pnl.month)}</h3>
      <div className="table-wrap">
        <table data-testid="store-pnl">
          <thead>
            <tr>
              <th>Cửa hàng</th>
              {STORE_COLUMNS.map(([, label]) => (
                <th key={label}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pnl.stores.map((r) => (
              <tr key={r.storeId}>
                <td>
                  {r.districtId.toUpperCase()}{' '}
                  <span className="muted small">{r.status === 'closed' ? '(đã đóng)' : ''}</span>
                </td>
                {STORE_COLUMNS.map(([k]) => (
                  <td key={k} className={`num ${r[k] < 0 ? 'bad' : ''}`}>
                    {usd(r[k])}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="subtotal">
              <th>Tổng cửa hàng</th>
              {STORE_COLUMNS.map(([k]) => (
                <td key={k} className="num">
                  {usd(pnl.storesTotal[k])}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <dl className="kv corporate">
        {corporateCosts
          .filter(([, v]) => v !== 0)
          .map(([label, v]) => (
            <div key={label} className="kv-row">
              <dt>{label}</dt>
              <dd>−{usd(v)}</dd>
            </div>
          ))}
        <div className="kv-row subtotal">
          <dt>Lợi nhuận ròng công ty</dt>
          <dd className={pnl.company.netIncome < 0 ? 'bad' : ''}>{usd(pnl.company.netIncome)}</dd>
        </div>
      </dl>
    </>
  );
}

function Advisor({ snap }: { snap: Snapshot }) {
  const a = snap.finance.advice;
  return (
    <>
      <h3>Tư vấn tài chính</h3>
      <dl className="kv advisor" data-testid="finance-advice">
        <div className="kv-row">
          <dt>Nợ (vay + thấu chi)</dt>
          <dd>{usd(a.debt)}</dd>
        </div>
        <div className="kv-row">
          <dt>EBITDA năm</dt>
          <dd>{usd(a.ebitdaAnnual)}</dd>
        </div>
        <div className="kv-row">
          <dt>Nợ / EBITDA</dt>
          <dd>{a.leverage === null ? '—' : a.leverage.toFixed(2)}</dd>
        </div>
        <div className="kv-row">
          <dt>DSCR (EBITDA / trả nợ năm)</dt>
          <dd>{a.dscr === null ? '—' : a.dscr.toFixed(2)}</dd>
        </div>
        <div className="kv-row">
          <dt>Lãi / EBITDA</dt>
          <dd>{a.interestBurden === null ? '—' : pct(a.interestBurden, 1)}</dd>
        </div>
      </dl>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Bậc nợ / EBITDA</th>
              <th>Lãi vay</th>
              <th>Vay thêm tối đa ở bậc này</th>
            </tr>
          </thead>
          <tbody>
            {a.tiers.map((t) => (
              <tr key={t.maxLeverage}>
                <td>≤ {t.maxLeverage}</td>
                <td className="num">{pct(t.annualRate, 2)}</td>
                <td className="num">{usd(t.maxPrincipal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {a.advice.length > 0 && (
        <ul className="advice">
          {a.advice.map((code) => (
            <li key={code}>{adviceText(code, a)}</li>
          ))}
        </ul>
      )}
    </>
  );
}

function CreditLine({ snap }: { snap: Snapshot }) {
  const send = useUi((s) => s.send);
  const cl = snap.finance.advice.creditLine;
  const limits = snap.limits.creditLine;
  return (
    <>
      <h3>Hạn mức tín dụng</h3>
      <p className="small muted">
        Thay hạn mức thấu chi mặc định. Lãi {pct(cl.creditLineRate, 1)}/năm khi dùng (thấu chi thường{' '}
        {pct(cl.overdraftRate, 1)}), phí cam kết {pct(cl.commitmentFeeAnnual, 1)}/năm trên phần chưa dùng. Tối
        đa 2 × doanh thu 3 tháng, chỉ khi nợ / EBITDA ≤ 2.
      </p>
      {cl.eligible || cl.limit > 0 ? (
        <Slider
          id="slider-credit-line"
          label="Hạn mức"
          value={cl.limit}
          {...limits}
          format={(v) => usd(money(v))}
          onCommit={(v) =>
            send({
              type: 'command',
              command: { type: 'SetCreditLine', companyId: snap.player.id, payload: { limit: money(v) } },
            })
          }
        />
      ) : (
        <p className="small bad">Chưa đủ điều kiện (cần ít nhất một tháng đã chốt và nợ / EBITDA ≤ 2).</p>
      )}
    </>
  );
}
