import { money } from '@game/sim-core';
import type { MomRow, MomTable as MomTableData } from '../sim/mom';
import { int, monthLabel, pct, signedUsd, usd } from '../format';

function value(r: MomRow, x: number): string {
  if (r.unit === 'money') return usd(money(x));
  if (r.unit === 'count') return int(x);
  return pct(x, 1);
}

function delta(r: MomRow, d: number): string {
  if (r.unit === 'money') return signedUsd(money(d));
  const sign = d > 0 ? '+' : d < 0 ? '−' : '';
  if (r.unit === 'count') return `${sign}${int(Math.abs(d))}`;
  return `${sign}${(Math.abs(d) * 100).toFixed(1)} điểm`;
}

function signedPct(p: number | null): string {
  if (p === null) return '—';
  return `${p > 0 ? '+' : p < 0 ? '−' : ''}${(Math.abs(p) * 100).toFixed(1)}%`;
}

/** Tăng xanh, giảm đỏ, không đổi giữ màu thường (áp cho mọi dòng). */
const tone = (d: number | null): string => (d === null || d === 0 ? '' : d > 0 ? 'good' : 'bad');
const arrow = (d: number | null): string => (d === null || d === 0 ? '' : d > 0 ? '▲ ' : '▼ ');

/** Bảng so sánh tháng gần nhất với tháng trước: Dòng | Tháng này | Tháng trước | Chênh lệch | %. */
export function MomTable({
  table,
  testId,
  rowTestId,
}: {
  table: MomTableData;
  testId: string;
  rowTestId: string;
}) {
  return (
    <div className="table-wrap">
      <table className="mom" data-testid={testId}>
        <thead>
          <tr>
            <th />
            <th className="num">{monthLabel(table.month)}</th>
            <th className="num" data-col="previous">
              {table.previousMonth === null ? 'Tháng trước' : monthLabel(table.previousMonth)}
            </th>
            <th className="num">Chênh lệch</th>
            <th className="num" data-col="pct">
              %
            </th>
          </tr>
        </thead>
        <tbody>
          {table.rows.map((r) => {
            const cls = tone(r.delta);
            return (
              <tr key={r.key} className={r.strong ? 'subtotal' : ''} data-testid={`${rowTestId}-${r.key}`}>
                <th>{r.label}</th>
                <td className="num" data-col="current" data-value={r.current}>
                  {value(r, r.current)}
                </td>
                <td className="num muted" data-col="previous" data-value={r.previous ?? ''}>
                  {r.previous === null ? '—' : value(r, r.previous)}
                </td>
                <td className={`num ${cls}`} data-col="delta">
                  {r.delta === null ? '—' : `${arrow(r.delta)}${delta(r, r.delta)}`}
                  {r.pct !== null && <span className="mom-pct-inline">{signedPct(r.pct)}</span>}
                </td>
                <td className={`num ${cls}`} data-col="pct">
                  {signedPct(r.pct)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
