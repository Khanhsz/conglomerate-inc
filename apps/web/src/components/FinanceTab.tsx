import { LOAN_TERMS_MONTHS, money } from '@game/sim-core';
import { useState } from 'react';
import type { Snapshot } from '../sim/snapshot';
import { useUi } from '../store';
import { pct, usd } from '../format';
import { FinanceDept } from './FinanceDept';
import { MomTable } from './MomTable';
import { Slider } from './Slider';

export function FinanceTab({ snap }: { snap: Snapshot }) {
  const send = useUi((s) => s.send);
  const [principal, setPrincipal] = useState(money(5_000_000));
  const [term, setTerm] = useState<number>(36);
  const mom = snap.financeMom;
  const companyId = snap.player.id;
  return (
    <section className="finance">
      <FinanceDept snap={snap} />
      <h3>Báo cáo tài chính · tháng này so với tháng trước</h3>
      <p className="small muted">
        Tăng màu xanh, giảm màu đỏ. Xu hướng dài hạn xem ở biểu đồ của phòng Tài chính.
      </p>
      {mom.pnl === null ? (
        <p className="muted">Chưa có tháng nào được chốt sổ (chốt vào cuối mỗi 30 ngày).</p>
      ) : (
        <>
          <h4>Kết quả kinh doanh</h4>
          <MomTable table={mom.pnl} testId="pnl" rowTestId="pnl" />
        </>
      )}
      {mom.balanceSheet && (
        <>
          <h4>Bảng cân đối (cuối tháng)</h4>
          <MomTable table={mom.balanceSheet} testId="balance-sheet" rowTestId="bs" />
        </>
      )}
      {mom.cashFlow && (
        <>
          <h4>Lưu chuyển tiền tệ</h4>
          <MomTable table={mom.cashFlow} testId="cash-flow" rowTestId="cf" />
        </>
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
