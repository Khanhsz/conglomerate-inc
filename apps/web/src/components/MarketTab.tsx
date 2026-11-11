import type { Snapshot } from '../sim/snapshot';
import { companyStyle, pct, usd } from '../format';

/** Thị phần (cầu kỳ vọng, gồm lựa chọn "không mua") dạng thanh ngang SVG + bảng đối thủ. */
export function MarketTab({ snap }: { snap: Snapshot }) {
  const bars = [
    ...snap.companies.map((c, i) => ({
      label: c.kind === 'player' ? 'Bạn' : c.name,
      value: c.marketShare,
      color: companyStyle(i).color,
    })),
    { label: 'Không mua', value: snap.outsideShare, color: '#9ca3af' },
  ];
  const rowH = 28;
  const labelW = 120;
  const width = 520;
  return (
    <section>
      <h3>Thị phần trên tổng lượt mua tiềm năng</h3>
      <svg className="bars" viewBox={`0 0 ${width} ${bars.length * rowH}`} role="img" aria-label="Thị phần">
        {bars.map((b, i) => {
          const w = Math.max(0, b.value) * (width - labelW - 60);
          return (
            <g key={b.label} transform={`translate(0, ${i * rowH})`}>
              <text x={0} y={rowH / 2 + 4} className="bar-label">
                {b.label}
              </text>
              <rect x={labelW} y={6} width={w} height={rowH - 12} fill={b.color} rx={3} />
              <text x={labelW + w + 6} y={rowH / 2 + 4} className="bar-value">
                {pct(b.value)}
              </text>
            </g>
          );
        })}
      </svg>
      <h3>Đối thủ</h3>
      <div className="table-wrap">
        <table className="kv">
          <thead>
            <tr>
              <th>Công ty</th>
              <th>Cửa hàng</th>
              <th>Giá trung bình</th>
              <th>Nhận biết thương hiệu</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {snap.companies.map((c, i) => (
              <tr key={c.id}>
                <td>
                  <span style={{ color: companyStyle(i).color }}>{companyStyle(i).glyph}</span>{' '}
                  {c.kind === 'player' ? `${c.name} (bạn)` : c.name}
                </td>
                <td className="num">{c.storeCount}</td>
                <td className="num">{c.avgPrice === null ? '—' : usd(c.avgPrice)}</td>
                <td className="num">{pct(c.brandAwareness)}</td>
                <td>{c.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
