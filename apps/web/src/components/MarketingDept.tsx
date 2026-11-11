import { CITY_TARGET, GENERAL_CHANNEL, money, type ChannelEffect } from '@game/sim-core';
import { useState } from 'react';
import { channelKey } from '../sim/pending';
import type { Snapshot } from '../sim/snapshot';
import { useUi } from '../store';
import { pct, usd } from '../format';
import { segmentName } from '../labels';
import { Stepper } from './Parts';

const ALL = 'all';
/** Trọng số từ mức này trở lên được coi là "mạnh với" phân khúc đó. */
const STRONG_WEIGHT = 0.8;
/** Mốc bão hòa hiển thị làm tròn tới $10. */
const SATURATION_ROUND = 1_000;

/** Nền ô bản đồ nhiệt: một sắc, đậm dần theo nhận biết; chữ luôn dùng màu chữ thường nên giới hạn độ đậm. */
const heat = (a: number) => `color-mix(in srgb, var(--series-1) ${(6 + 44 * a).toFixed(1)}%, var(--panel))`;

/** Phòng Marketing (economic-model §18): bản đồ nhận biết, ngân sách kênh theo thành phố / quận, hiệu quả từng kênh. */
export function MarketingDept({ snap }: { snap: Snapshot }) {
  const { open, view, byDistrict } = snap.marketing;
  const playerId = snap.player.id;
  const ownStores = (districtId: string) =>
    snap.districts.find((d) => d.id === districtId)?.stores.find((s) => s.companyId === playerId)?.count ?? 0;
  const [segment, setSegment] = useState<string>(ALL);
  // Quận người chơi đã bấm; chưa bấm thì theo quận có cửa hàng (tính lại mỗi lần, vì cửa hàng có thể mở sau).
  const [picked, setPicked] = useState<string | null>(null);
  const selected =
    picked ?? snap.districts.find((d) => ownStores(d.id) > 0)?.id ?? snap.districts[0]?.id ?? '';
  // Chưa mở phòng: màn hình Trụ sở đã hiện thẻ "mở phòng"; phần này chỉ có khi phòng đang mở.
  if (!open) return null;

  const S = view.segmentIds.length;
  const s = view.segmentIds.indexOf(segment);
  const value = (e: number) => (s < 0 ? (byDistrict[e] ?? 0) : (view.awareness[e * S + s] ?? 0));
  const columns = Math.max(...snap.districts.map((d) => d.x)) + 1;

  return (
    <section className="marketing-dept" data-testid="marketing-dept">
      <h3>Nhận biết thương hiệu theo quận</h3>
      <div className="chips" role="group" aria-label="Nhóm khách">
        {[ALL, ...view.segmentIds].map((id) => (
          <button
            key={id}
            type="button"
            className="chip-button"
            aria-pressed={segment === id}
            data-testid={`segment-${id}`}
            onClick={() => setSegment(id)}
          >
            {id === ALL ? 'Tất cả' : segmentName(id)}
          </button>
        ))}
      </div>
      <div
        className="heatmap"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        data-testid="awareness-map"
      >
        {snap.districts.map((d, e) => {
          const stores = ownStores(d.id);
          return (
            <button
              key={d.id}
              type="button"
              className="heat-cell"
              aria-pressed={selected === d.id}
              data-testid={`heat-${d.id}`}
              data-awareness={value(e).toFixed(4)}
              style={{ gridColumn: d.x + 1, gridRow: d.y + 1, background: heat(value(e)) }}
              onClick={() => setPicked(d.id)}
            >
              <span className="heat-id">{d.id.toUpperCase()}</span>
              <strong>{pct(value(e), 0)}</strong>
              <span className="heat-stores">{stores > 0 ? `◆ ${stores}` : ' '}</span>
            </button>
          );
        })}
      </div>
      <p className="small muted">
        Màu càng đậm, càng nhiều người ở quận đó biết thương hiệu. ◆ là số cửa hàng của bạn. Bấm một quận để
        đặt ngân sách cho các kênh theo quận.
      </p>

      <h3>Kênh marketing</h3>
      <div className="channels">
        {view.channels
          .filter((c) => c.channel !== GENERAL_CHANNEL)
          .map((c) => (
            <ChannelCard key={c.channel} snap={snap} channel={c} district={selected} />
          ))}
      </div>

      <h3>Hiệu quả theo kênh</h3>
      <div className="table-wrap">
        <table className="mom effects" data-testid="channel-effects">
          <thead>
            <tr>
              <th>Kênh</th>
              <th className="num">Ngân sách / tháng</th>
              <th className="num hide-narrow">Nhận biết đóng góp</th>
              <th className="num">Khách thêm / ngày</th>
              <th className="num">ROI</th>
            </tr>
          </thead>
          <tbody>
            {view.channels.map((c) => (
              <tr key={c.channel} data-testid={`effect-${c.channel}`}>
                <th>{c.name}</th>
                <td className="num" data-cents={c.monthlySpend}>
                  {usd(c.monthlySpend)}
                </td>
                <td className="num hide-narrow">
                  {c.contribution > 0 ? `+${(c.contribution * 100).toFixed(1)} điểm` : '—'}
                </td>
                <td className="num">
                  {c.extraCustomersPerDay > 0 ? `+${c.extraCustomersPerDay.toFixed(1)}` : '—'}
                </td>
                <td className={`num ${c.roi === null ? '' : c.roi >= 1 ? 'good' : 'bad'}`}>
                  {c.roi === null ? '—' : `${c.roi.toFixed(2)}×`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small muted">
        Nhận biết đóng góp: phần nhận biết hiện có nhờ kênh (trung bình theo dân số). ROI = lãi gộp có thêm
        trong 30 ngày ÷ ngân sách tháng của kênh; trên 1× là kênh đang tự trả được chi phí. Nhận biết tích lũy
        dần nên ROI của kênh mới chi sẽ tăng theo thời gian.
      </p>
    </section>
  );
}

function ChannelCard({
  snap,
  channel,
  district,
}: {
  snap: Snapshot;
  channel: ChannelEffect;
  district: string;
}) {
  const send = useUi((s) => s.send);
  const target = channel.scope === 'city' ? CITY_TARGET : district;
  const current = channel.budgets.find((b) => b.target === target)?.monthly ?? 0;
  const pending = snap.pending.channelBudgets[channelKey(channel.channel, target)];
  const strong = Object.keys(channel.segmentWeight)
    .sort()
    .filter((s) => (channel.segmentWeight[s] ?? 0) >= STRONG_WEIGHT)
    .map(segmentName);
  const elsewhere = channel.budgets.filter((b) => b.target !== target);
  return (
    <article className="card channel" data-testid={`channel-card-${channel.channel}`}>
      <h3>{channel.name}</h3>
      <p className="small">
        <span className="chip chip-info">{channel.scope === 'city' ? 'Toàn thành phố' : 'Theo quận'}</span>{' '}
        Mạnh với: {strong.length > 0 ? strong.join(', ') : 'không nhóm nào nổi bật'}.
      </p>
      <p className="small muted">
        Hiệu quả giảm dần khi chi quá khoảng{' '}
        {usd(money(Math.round((channel.halfSaturationDaily * 30) / SATURATION_ROUND) * SATURATION_ROUND))}
        /tháng
        {channel.scope === 'district' ? ' cho một quận' : ''}.
      </p>
      <Stepper
        id={`channel-${channel.channel}`}
        label={channel.scope === 'city' ? 'Ngân sách / tháng' : `Quận ${district.toUpperCase()} / tháng`}
        value={pending ?? current}
        {...snap.limits.channelBudget}
        format={(v) => usd(money(v))}
        onCommit={(monthly) =>
          send({
            type: 'command',
            command: {
              type: 'SetChannelBudget',
              companyId: snap.player.id,
              payload: { channel: channel.channel, target, monthly: money(monthly) },
            },
          })
        }
      />
      {channel.scope === 'district' && (
        <p className="small muted" data-testid={`channel-total-${channel.channel}`}>
          {elsewhere.length > 0
            ? `Quận khác: ${elsewhere.map((b) => `${b.target.toUpperCase()} ${usd(b.monthly)}`).join(' · ')}. `
            : ''}
          Tổng kênh: {usd(channel.monthlySpend)}/tháng
        </p>
      )}
    </article>
  );
}
