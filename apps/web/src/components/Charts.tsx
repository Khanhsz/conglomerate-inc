import { money, toDisplay, type Money, type PricePoint, type StoreDayRecord } from '@game/sim-core';
import { int } from '../format';

const W = 520;
const H = 120;
const PAD = { l: 52, r: 12, t: 10, b: 22 };

/** Đường cong "giá → khách/ngày" và "giá → lãi đóng góp/ngày", đánh dấu giá hiện tại và giá đang thử. */
export function PriceCurve(props: { curve: readonly PricePoint[]; current: Money; preview: Money | null }) {
  const { curve } = props;
  if (curve.length < 2) return null;
  const first = curve[0];
  const last = curve[curve.length - 1];
  if (!first || !last) return null;
  const lx0 = Math.log(first.price);
  const lx1 = Math.log(last.price);
  const x = (price: number) => PAD.l + ((Math.log(price) - lx0) / (lx1 - lx0)) * (W - PAD.l - PAD.r);
  const chart = (title: string, ys: readonly number[], fmt: (v: number) => string, cls: string) => {
    const lo = Math.min(0, ...ys);
    const hi = Math.max(...ys, lo + 1);
    const y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b);
    const d = curve
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.price).toFixed(1)},${y(ys[i] ?? 0).toFixed(1)}`)
      .join(' ');
    return (
      <figure className="chart">
        <figcaption>{title}</figcaption>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(0)} y2={y(0)} className="axis" />
          <text x={PAD.l - 6} y={y(hi) + 4} className="tick" textAnchor="end">
            {fmt(hi)}
          </text>
          <text x={PAD.l - 6} y={y(lo) + 4} className="tick" textAnchor="end">
            {fmt(lo)}
          </text>
          <path d={d} className={cls} />
          <line
            x1={x(props.current)}
            x2={x(props.current)}
            y1={PAD.t}
            y2={H - PAD.b}
            className="marker-current"
          />
          {props.preview !== null && (
            <line
              x1={x(props.preview)}
              x2={x(props.preview)}
              y1={PAD.t}
              y2={H - PAD.b}
              className="marker-preview"
            />
          )}
          <text x={PAD.l} y={H - 6} className="tick">
            {toDisplay(first.price)}
          </text>
          <text x={W - PAD.r} y={H - 6} className="tick" textAnchor="end">
            {toDisplay(last.price)}
          </text>
        </svg>
      </figure>
    );
  };
  return (
    <div className="charts">
      {chart(
        'Giá → khách phục vụ/ngày (ước tính)',
        curve.map((p) => p.served),
        (v) => int(v),
        'line-a',
      )}
      {chart(
        'Giá → lãi đóng góp/ngày (ước tính)',
        curve.map((p) => p.contributionPerDay),
        (v) => toDisplay(money(Math.round(v))),
        'line-b',
      )}
    </div>
  );
}

/** 14 ngày gần nhất: khách phục vụ (đậm), khách mất (nhạt), vạch công suất. */
export function DayChart(props: { days: readonly StoreDayRecord[] }) {
  const { days } = props;
  if (days.length === 0) return <p className="muted">Chưa có dữ liệu ngày.</p>;
  const hi = Math.max(1, ...days.map((d) => Math.max(d.demand, d.capacity)));
  const bw = (W - PAD.l - PAD.r) / days.length;
  const y = (v: number) => PAD.t + (1 - v / hi) * (H - PAD.t - PAD.b);
  const DOW = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
  return (
    <figure className="chart">
      <figcaption>14 ngày gần nhất: khách phục vụ, khách mất và công suất</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Cầu và công suất 14 ngày">
        <text x={PAD.l - 6} y={y(hi) + 4} className="tick" textAnchor="end">
          {int(hi)}
        </text>
        <text x={PAD.l - 6} y={y(0) + 4} className="tick" textAnchor="end">
          0
        </text>
        {days.map((d, i) => {
          const x0 = PAD.l + i * bw + 2;
          return (
            <g key={d.day}>
              <rect
                x={x0}
                y={y(d.served)}
                width={bw - 4}
                height={y(0) - y(d.served)}
                className="bar-served"
              />
              {d.demand > d.served && (
                <rect
                  x={x0}
                  y={y(d.demand)}
                  width={bw - 4}
                  height={y(d.served) - y(d.demand)}
                  className="bar-lost"
                />
              )}
              <line x1={x0 - 1} x2={x0 + bw - 3} y1={y(d.capacity)} y2={y(d.capacity)} className="cap-line" />
              <text x={x0 + (bw - 4) / 2} y={H - 6} className="tick" textAnchor="middle">
                {DOW[d.day % 7]}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
