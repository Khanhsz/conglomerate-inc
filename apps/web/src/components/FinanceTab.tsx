import { LOAN_TERMS_MONTHS, money, type MonthlyStatements, type PnL } from '@game/sim-core';
import { useState } from 'react';
import type { Snapshot } from '../sim/snapshot';
import { useUi } from '../store';
import { pct, usd } from '../format';
import { FinanceDept } from './FinanceDept';
import { Slider } from './Slider';

const PNL_ROWS: readonly (readonly [keyof PnL, string, boolean?])[] = [
  ['revenue', 'Revenue'],
  ['cogs', 'COGS'],
  ['grossProfit', 'Gross profit', true],
  ['wages', 'Wages'],
  ['amenities', 'Tiện ích cửa hàng'],
  ['rent', 'Rent'],
  ['marketing', 'Marketing'],
  ['admin', 'Admin'],
  ['officeRent', 'Thuê văn phòng'],
  ['departments', 'Phòng ban'],
  ['research', 'R&D'],
  ['ebitda', 'EBITDA', true],
  ['depreciation', 'Depreciation'],
  ['lossOnDisposal', 'Loss on disposal'],
  ['ebit', 'EBIT', true],
  ['interest', 'Interest'],
  ['preTax', 'Pre-tax', true],
  ['incomeTax', 'Income tax'],
  ['netIncome', 'Net income', true],
];

const monthLabel = (m: MonthlyStatements) => `N${Math.floor(m.month / 12) + 1}·T${(m.month % 12) + 1}`;

export function FinanceTab({ snap }: { snap: Snapshot }) {
  const send = useUi((s) => s.send);
  const [principal, setPrincipal] = useState(money(5_000_000));
  const [term, setTerm] = useState<number>(36);
  const last = snap.statements[snap.statements.length - 1];
  const companyId = snap.player.id;
  return (
    <section className="finance">
      <FinanceDept snap={snap} />
      <h3>Báo cáo kết quả kinh doanh (12 tháng gần nhất)</h3>
      {snap.statements.length === 0 ? (
        <p className="muted">Chưa có tháng nào được chốt sổ (chốt vào cuối mỗi 30 ngày).</p>
      ) : (
        <div className="table-wrap">
          <table className="pnl">
            <thead>
              <tr>
                <th />
                {snap.statements.map((m) => (
                  <th key={m.month}>{monthLabel(m)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PNL_ROWS.map(([key, label, strong]) => (
                <tr key={key} className={strong ? 'subtotal' : ''} data-testid={`pnl-${key}`}>
                  <th>{label}</th>
                  {snap.statements.map((m) => (
                    <td
                      key={m.month}
                      className={`num ${m.pnl[key] < 0 ? 'bad' : ''}`}
                      data-cents={m.pnl[key]}
                    >
                      {usd(m.pnl[key])}
                    </td>
                  ))}
                </tr>
              ))}
              <tr>
                <th>Biên EBITDA</th>
                {snap.statements.map((m) => (
                  <td key={m.month} className="num">
                    {pct(m.kpis.ebitdaMargin)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
      {last && (
        <div className="two-col">
          <div>
            <h3>Bảng cân đối (cuối {monthLabel(last)})</h3>
            <table className="kv">
              <tbody>
                <tr>
                  <th>Tiền mặt</th>
                  <td className="num">{usd(last.balanceSheet.cash)}</td>
                </tr>
                <tr>
                  <th>TSCĐ (nguyên giá)</th>
                  <td className="num">{usd(last.balanceSheet.ppe)}</td>
                </tr>
                <tr>
                  <th>Khấu hao lũy kế</th>
                  <td className="num">−{usd(last.balanceSheet.accumulatedDepreciation)}</td>
                </tr>
                <tr className="subtotal">
                  <th>Tổng tài sản</th>
                  <td className="num">{usd(last.balanceSheet.totalAssets)}</td>
                </tr>
                <tr>
                  <th>Thấu chi</th>
                  <td className="num">{usd(last.balanceSheet.overdraft)}</td>
                </tr>
                <tr>
                  <th>Vay</th>
                  <td className="num">{usd(last.balanceSheet.loans)}</td>
                </tr>
                <tr>
                  <th>Thuế phải nộp</th>
                  <td className="num">{usd(last.balanceSheet.taxPayable)}</td>
                </tr>
                <tr className="subtotal">
                  <th>Tổng nợ</th>
                  <td className="num">{usd(last.balanceSheet.totalLiabilities)}</td>
                </tr>
                <tr>
                  <th>Vốn góp</th>
                  <td className="num">{usd(last.balanceSheet.shareCapital)}</td>
                </tr>
                <tr>
                  <th>Lợi nhuận giữ lại</th>
                  <td className="num">{usd(last.balanceSheet.retainedEarnings)}</td>
                </tr>
                <tr className="subtotal">
                  <th>Vốn chủ</th>
                  <td className="num">{usd(last.balanceSheet.totalEquity)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div>
            <h3>Lưu chuyển tiền tệ {monthLabel(last)}</h3>
            <table className="kv">
              <tbody>
                <tr>
                  <th>Lợi nhuận ròng</th>
                  <td className="num">{usd(last.cashFlow.netIncome)}</td>
                </tr>
                <tr>
                  <th>+ Khấu hao</th>
                  <td className="num">{usd(last.cashFlow.depreciation)}</td>
                </tr>
                <tr>
                  <th>+ Lỗ thanh lý</th>
                  <td className="num">{usd(last.cashFlow.lossOnDisposal)}</td>
                </tr>
                <tr>
                  <th>± Thuế phải nộp</th>
                  <td className="num">{usd(last.cashFlow.changeInTaxPayable)}</td>
                </tr>
                <tr className="subtotal">
                  <th>CFO</th>
                  <td className="num">{usd(last.cashFlow.cfo)}</td>
                </tr>
                <tr className="subtotal">
                  <th>CFI (capex)</th>
                  <td className="num">{usd(last.cashFlow.cfi)}</td>
                </tr>
                <tr className="subtotal">
                  <th>CFF (vốn, vay, thấu chi)</th>
                  <td className="num">{usd(last.cashFlow.cff)}</td>
                </tr>
                <tr className="subtotal">
                  <th>Tiền mặt thay đổi</th>
                  <td className="num">{usd(last.cashFlow.netChange)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
      <h3>Vay</h3>
      <div className="company-controls">
        <div className="grow">
          <Slider
            id="slider-loan"
            label="Số tiền vay"
            value={principal}
            {...snap.limits.loan}
            format={(v) => usd(money(v))}
            onCommit={(v) => setPrincipal(money(v))}
          />
        </div>
        <label>
          Kỳ hạn{' '}
          <select aria-label="Kỳ hạn" value={term} onChange={(e) => setTerm(Number(e.target.value))}>
            {LOAN_TERMS_MONTHS.map((t) => (
              <option key={t} value={t}>
                {t} tháng
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={() =>
            send({
              type: 'command',
              command: { type: 'TakeLoan', companyId, payload: { principal, termMonths: term } },
            })
          }
        >
          Vay
        </button>
        <span className="muted">
          Lãi = lãi chính sách + spread theo nợ / EBITDA năm; cần ít nhất 1 tháng đã chốt.
        </span>
      </div>
      {snap.loans.length > 0 && (
        <table className="kv loans">
          <thead>
            <tr>
              <th>Khoản vay</th>
              <th>Dư nợ</th>
              <th>Trả/tháng</th>
              <th>Lãi</th>
              <th>Đã trả</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {snap.loans.map((l) => (
              <tr key={l.id}>
                <td>{l.id}</td>
                <td className="num">{usd(l.outstanding)}</td>
                <td className="num">{usd(l.paymentMonthly)}</td>
                <td className="num">{pct(l.annualRate, 2)}</td>
                <td className="num">
                  {l.paymentsMade}/{l.termMonths}
                </td>
                <td>
                  <button
                    onClick={() =>
                      send({
                        type: 'command',
                        command: { type: 'RepayLoan', companyId, payload: { loanId: l.id } },
                      })
                    }
                  >
                    Trả sớm (+{pct(snap.rules.earlyRepaymentFee, 0)})
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
