/** Thành phần dùng chung của các màn hình (M1.7 U2). Mọi màu lấy từ token theme. */
import { useEffect, useState, type ReactNode } from 'react';
import { stepValue } from '../ui/stepper';

export type Role = 'finance' | 'hr' | 'product' | 'marketing' | 'office' | 'store' | 'board';
export type Tone = 'good' | 'warn' | 'bad' | 'info';

/** Biểu tượng vai trò: hình khối trừu tượng (không phải nhân vật), mỗi vai trò một ký hiệu. */
const ROLE_MARK: { readonly [R in Role]: string } = {
  finance: '$',
  hr: '◍',
  product: '◒',
  marketing: '◎',
  office: '▦',
  store: '⌂',
  board: '◆',
};

/** Dải cố vấn: một câu về việc đáng chú ý nhất của màn hình (từ cảnh báo / tư vấn thật). */
export function AdvisorStrip({ role, tone, children }: { role: Role; tone: Tone; children: ReactNode }) {
  return (
    <aside className={`advisor advisor-${tone}`} data-testid="advisor" aria-live="polite">
      <span className="advisor-badge" aria-hidden="true">
        {ROLE_MARK[role]}
      </span>
      <p>{children}</p>
    </aside>
  );
}

export interface Kpi {
  readonly label: string;
  readonly value: string;
  /** Chênh lệch so với kỳ trước đã định dạng, và nó tốt hay xấu cho người chơi. */
  readonly delta?: { readonly text: string; readonly tone: Tone } | null;
  /** Chuỗi giá trị cho biểu đồ nhỏ (cũ → mới). */
  readonly series?: readonly number[];
  readonly testId?: string;
}

export function KpiPair({ items }: { items: readonly Kpi[] }) {
  return (
    <div className="kpis">
      {items.map((k) => (
        <div key={k.label} className="kpi" data-testid={k.testId}>
          <span className="kpi-label">{k.label}</span>
          <strong className="kpi-value">{k.value}</strong>
          {k.delta && <span className={`kpi-delta ${k.delta.tone}`}>{k.delta.text}</span>}
          {k.series && k.series.length > 1 && <Sparkline values={k.series} />}
        </div>
      ))}
    </div>
  );
}

export function Sparkline({ values }: { values: readonly number[] }) {
  const w = 120;
  const h = 32;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const pts = values.map(
    (v, i) => [(i / (values.length - 1)) * (w - 4) + 2, h - 3 - ((v - lo) / span) * (h - 6)] as const,
  );
  const last = pts[pts.length - 1];
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <path d={pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')} />
      {last && <circle cx={last[0]} cy={last[1]} r={2.5} />}
    </svg>
  );
}

/**
 * Nút − giá trị +, bước và giới hạn dùng chung với thanh kéo (sim/limits.ts).
 * Mỗi lần bấm gửi giá trị mới ngay (lệnh vào hàng đợi, áp ở đầu ngày kế tiếp).
 */
export function Stepper(props: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onCommit: (v: number) => void;
  disabled?: boolean;
}) {
  const [shown, setShown] = useState(props.value);
  useEffect(() => setShown(props.value), [props.value]);
  const change = (dir: -1 | 1) => {
    const next = stepValue(shown, dir, props);
    if (next === shown) return;
    setShown(next);
    props.onCommit(next);
  };
  return (
    <div className="stepper" data-testid={props.id}>
      <span className="stepper-label">{props.label}</span>
      <div className="stepper-row">
        <button
          type="button"
          aria-label={`Giảm ${props.label}`}
          data-testid={`${props.id}-minus`}
          disabled={props.disabled || shown <= props.min}
          onClick={() => change(-1)}
        >
          −
        </button>
        <output className="stepper-value" aria-live="polite">
          {props.format(shown)}
        </output>
        <button
          type="button"
          aria-label={`Tăng ${props.label}`}
          data-testid={`${props.id}-plus`}
          disabled={props.disabled || shown >= props.max}
          onClick={() => change(1)}
        >
          +
        </button>
      </div>
    </div>
  );
}

export interface Slice {
  readonly label: string;
  readonly value: number;
  /** Giá trị CSS, ví dụ `var(--company-2)`. */
  readonly color: string;
}

/** Donut SVG: các phần theo tỷ lệ, nhãn % trong chú giải. */
export function Donut({
  slices,
  center,
  testId,
}: {
  slices: readonly Slice[];
  center?: string;
  testId?: string;
}) {
  const total = slices.reduce((a, s) => a + Math.max(0, s.value), 0) || 1;
  const r = 40;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <figure className="donut" data-testid={testId}>
      <svg
        viewBox="0 0 100 100"
        role="img"
        aria-label={slices.map((s) => `${s.label} ${Math.round((s.value / total) * 100)}%`).join(', ')}
      >
        <circle cx={50} cy={50} r={r} className="donut-track" />
        {slices.map((s) => {
          const len = (Math.max(0, s.value) / total) * c;
          const el = (
            <circle
              key={s.label}
              cx={50}
              cy={50}
              r={r}
              style={{ stroke: s.color }}
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-offset}
              className="donut-slice"
            />
          );
          offset += len;
          return el;
        })}
        {center && (
          <text x={50} y={54} textAnchor="middle" className="donut-center">
            {center}
          </text>
        )}
      </svg>
      <figcaption>
        <ul className="donut-legend">
          {slices.map((s) => (
            <li key={s.label}>
              <span className="swatch" style={{ background: s.color }} />
              {s.label} <b>{Math.round((s.value / total) * 100)}%</b>
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}

/** Sao 1–5, bước nửa sao (spec M1.7: sao = 1 + 4x). */
export function StarRating({
  stars,
  label,
  showValue = true,
}: {
  stars: number;
  label: string;
  showValue?: boolean;
}) {
  const full = Math.floor(stars);
  const half = stars - full >= 0.5;
  return (
    <span className="stars" role="img" aria-label={`${label}: ${stars.toFixed(1)} trên 5 sao`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={i < full ? 'on' : i === full && half ? 'half' : 'off'} aria-hidden="true">
          ★
        </span>
      ))}
      {showValue && <b>{stars.toFixed(1)}</b>}
    </span>
  );
}

export function Chip({ tone, children }: { tone: Tone | 'ok'; children: ReactNode }) {
  return <span className={`chip chip-${tone}`}>{children}</span>;
}
