import { money, toDisplay } from '@game/sim-core';

const W = 640;
const H = 150;
const PAD = { l: 64, r: 12, t: 12, b: 22 };

export interface Series {
  readonly label: string;
  /** Lớp CSS của đường (màu lấy từ token). */
  readonly cls: string;
  /** Cent, cùng độ dài với `labels`. */
  readonly values: readonly number[];
}

/** Biểu đồ đường theo tháng (tiền), có trục 0 và nhãn đầu/cuối. Dữ liệu đã tính sẵn ở worker. */
export function TrendChart({
  title,
  labels,
  series,
}: {
  title: string;
  labels: readonly string[];
  series: readonly Series[];
}) {
  if (labels.length < 2) return null;
  const all = series.flatMap((s) => s.values);
  const lo = Math.min(0, ...all);
  const hi = Math.max(...all, lo + 1);
  const x = (i: number) => PAD.l + (i / (labels.length - 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b);
  const fmt = (v: number) => toDisplay(money(Math.round(v)));
  return (
    <figure className="chart">
      <figcaption>
        {title}
        <span className="legend">
          {series.map((s) => (
            <span key={s.label} className={`key ${s.cls}`}>
              {s.label}
            </span>
          ))}
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
        <line x1={PAD.l} x2={W - PAD.r} y1={y(0)} y2={y(0)} className="axis" />
        <text x={PAD.l - 6} y={y(hi) + 4} className="tick" textAnchor="end">
          {fmt(hi)}
        </text>
        <text x={PAD.l - 6} y={y(lo) + 4} className="tick" textAnchor="end">
          {fmt(lo)}
        </text>
        {series.map((s) => (
          <path
            key={s.label}
            className={s.cls}
            d={s.values
              .map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
              .join(' ')}
          />
        ))}
        <text x={PAD.l} y={H - 6} className="tick">
          {labels[0]}
        </text>
        <text x={W - PAD.r} y={H - 6} className="tick" textAnchor="end">
          {labels[labels.length - 1]}
        </text>
      </svg>
    </figure>
  );
}
