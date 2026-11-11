import { ZERO, type Money } from '@game/sim-core';
import { useState } from 'react';
import { compactUsd, usd } from '../format';

export interface ColumnSeries {
  readonly label: string;
  /** Lớp CSS của màu series (`series-1`, `series-2`). */
  readonly cls: string;
  readonly values: readonly Money[];
}

// Hệ tọa độ hẹp để chữ trong SVG vẫn đọc được khi co về bề ngang điện thoại (~330px).
const W = 360;
const H = 180;
const PAD = { l: 46, r: 4, t: 18, b: 22 };
const BAR_MAX = 24;
const GAP = 2;
const R = 4;

/** Cột bo góc ở đầu dữ liệu, chân cột nằm trên đường 0 (cột âm bo góc phía dưới). */
function barPath(x: number, w: number, y0: number, y1: number): string {
  const h = Math.abs(y1 - y0);
  if (h < 0.5) return '';
  const r = Math.min(R, w / 2, h);
  if (y1 < y0) {
    return `M${x},${y0} V${y1 + r} Q${x},${y1} ${x + r},${y1} H${x + w - r} Q${x + w},${y1} ${x + w},${y1 + r} V${y0} Z`;
  }
  return `M${x},${y0} V${y1 - r} Q${x},${y1} ${x + r},${y1} H${x + w - r} Q${x + w},${y1} ${x + w},${y1 - r} V${y0} Z`;
}

/**
 * Biểu đồ cột nhóm: mỗi nhóm một tháng, mỗi series một cột, chung một trục (tiền).
 * Rê chuột / chạm vào một tháng để xem số chính xác ở dòng chú thích phía trên.
 */
export function ColumnChart(props: {
  title: string;
  labels: readonly string[];
  series: readonly ColumnSeries[];
  testId?: string;
}) {
  const { labels, series } = props;
  const [hover, setHover] = useState<number | null>(null);
  const n = labels.length;
  if (n === 0 || series.length === 0) return null;
  const all = series.flatMap((s) => s.values);
  const lo = Math.min(0, ...all);
  const hi = Math.max(0, ...all, lo + 1);
  const plotH = H - PAD.t - PAD.b;
  const y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo)) * plotH;
  const groupW = (W - PAD.l - PAD.r) / n;
  const barW = Math.min(BAR_MAX, (groupW * 0.7 - GAP * (series.length - 1)) / series.length);
  const clusterW = barW * series.length + GAP * (series.length - 1);
  const x0 = (g: number) => PAD.l + g * groupW + (groupW - clusterW) / 2;
  const shown = hover ?? n - 1;

  return (
    <figure className="chart column-chart" data-testid={props.testId}>
      <figcaption>{props.title}</figcaption>
      {/* Chú thích kiêm tooltip: màu, tên series và số chính xác của tháng đang chọn (mặc định tháng mới nhất). */}
      <div className="column-tooltip" aria-live="polite">
        <strong>{labels[shown]}</strong>
        {series.map((s) => (
          <span key={s.label}>
            <span className={`dot ${s.cls}`} aria-hidden="true" /> {s.label}{' '}
            <b>{usd(s.values[shown] ?? ZERO)}</b>
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={props.title} onMouseLeave={() => setHover(null)}>
        <line x1={PAD.l} x2={W - PAD.r} y1={y(hi)} y2={y(hi)} className="grid" />
        {lo < 0 && <line x1={PAD.l} x2={W - PAD.r} y1={y(lo)} y2={y(lo)} className="grid" />}
        <text x={PAD.l - 6} y={y(hi) + 4} className="tick" textAnchor="end">
          {compactUsd(hi)}
        </text>
        <text x={PAD.l - 6} y={y(0) + 4} className="tick" textAnchor="end">
          $0
        </text>
        {lo < 0 && (
          <text x={PAD.l - 6} y={y(lo) + 4} className="tick" textAnchor="end">
            {compactUsd(lo)}
          </text>
        )}
        {labels.map((label, g) => (
          <g key={label} className={g === hover ? 'group active' : 'group'}>
            <rect
              className="hit"
              x={PAD.l + g * groupW}
              y={PAD.t}
              width={groupW}
              height={plotH}
              onMouseEnter={() => setHover(g)}
              onClick={() => setHover(g)}
            />
            {series.map((s, i) => {
              const v = s.values[g] ?? 0;
              const x = x0(g) + i * (barW + GAP);
              return (
                <g key={s.label}>
                  <path d={barPath(x, barW, y(0), y(v))} className={`bar ${s.cls}`} />
                </g>
              );
            })}
            <text x={PAD.l + g * groupW + groupW / 2} y={H - 6} className="tick" textAnchor="middle">
              {label}
            </text>
          </g>
        ))}
        <line x1={PAD.l} x2={W - PAD.r} y1={y(0)} y2={y(0)} className="axis" />
      </svg>
    </figure>
  );
}
