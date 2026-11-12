/**
 * Sơ đồ mặt bằng (M1.7 U3): bản vẽ nhìn từ trên xuống, sinh từ state, màu lấy từ token theme.
 * Không dùng ảnh ngoài; mỗi sơ đồ giới hạn ~200 phần tử.
 */
import { DEPARTMENT_LABEL, DEPARTMENTS, type Department } from '@game/sim-core';
import { memo } from 'react';

const W = 360;
const H = 170;

interface RoomSpec {
  readonly dept: Department | null;
  readonly open: boolean;
  readonly active: boolean;
  /** Chi tiết theo chính sách: số ghế lớp học (đào tạo), bàn họp (ban điều hành). */
  readonly extra: number;
}

/** Mặt bằng trụ sở: mỗi chỗ phòng ban một phòng; phòng đã mở có bàn và người, phòng đang xem được tô nhấn. */
export const FloorPlan = memo(function FloorPlan(props: {
  slots: number;
  open: readonly Department[];
  active: Department | null;
  trainingLevel: number;
  hasOffice: boolean;
}) {
  if (!props.hasOffice) {
    return (
      <svg
        className="plan"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Chưa có văn phòng: mặt bằng trống"
      >
        <rect x={8} y={8} width={W - 16} height={H - 16} className="plan-lot" />
        <text x={W / 2} y={H / 2} textAnchor="middle" className="plan-label">
          Mặt bằng trống · chưa thuê văn phòng
        </text>
      </svg>
    );
  }
  // Phòng đã mở theo thứ tự DEPARTMENTS, rồi các chỗ trống.
  const rooms: RoomSpec[] = DEPARTMENTS.filter((d) => props.open.includes(d)).map((d) => ({
    dept: d,
    open: true,
    active: d === props.active,
    extra: d === 'hr' ? props.trainingLevel : d === 'board' ? 1 : 0,
  }));
  while (rooms.length < props.slots) rooms.push({ dept: null, open: false, active: false, extra: 0 });
  const cols = rooms.length <= 2 ? rooms.length : Math.ceil(rooms.length / 2);
  const rows = rooms.length <= 2 ? 1 : 2;
  const pad = 10;
  const rw = (W - pad * 2) / cols;
  const rh = (H - pad * 2 - 18) / rows;
  return (
    <svg
      className="plan"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Mặt bằng văn phòng: ${rooms.filter((r) => r.open).length}/${props.slots} phòng đang dùng`}
      data-testid="floor-plan"
    >
      <rect x={pad - 4} y={pad - 4} width={W - 2 * pad + 8} height={H - 2 * pad + 8} className="plan-wall" />
      {rooms.map((r, i) => {
        const x = pad + (i % cols) * rw;
        const y = pad + Math.floor(i / cols) * rh;
        return <Room key={r.dept ?? `free-${i}`} x={x} y={y} w={rw} h={rh} room={r} />;
      })}
      {/* hành lang + cửa ra vào */}
      <rect x={pad} y={H - pad - 14} width={W - 2 * pad} height={10} className="plan-hall" />
      <rect x={W / 2 - 16} y={H - pad - 2} width={32} height={6} className="plan-door" />
    </svg>
  );
});

function Room({ x, y, w, h, room }: { x: number; y: number; w: number; h: number; room: RoomSpec }) {
  const inner = { x: x + 3, y: y + 3, w: w - 6, h: h - 6 };
  const desks = room.open
    ? Math.max(2, Math.min(6, Math.floor(inner.w / 34) * Math.floor((inner.h - 16) / 24)))
    : 0;
  const perRow = Math.max(1, Math.floor(inner.w / 34));
  return (
    <g className={`plan-room ${room.open ? 'open' : 'free'} ${room.active ? 'active' : ''}`}>
      <rect x={inner.x} y={inner.y} width={inner.w} height={inner.h} rx={3} />
      <text x={inner.x + 6} y={inner.y + 13} className="plan-room-label">
        {room.dept ? DEPARTMENT_LABEL[room.dept] : 'Trống'}
      </text>
      {Array.from({ length: desks }, (_, k) => {
        const dx = inner.x + 8 + (k % perRow) * 34;
        const dy = inner.y + 20 + Math.floor(k / perRow) * 24;
        return (
          <g key={k}>
            <rect x={dx} y={dy} width={22} height={12} rx={2} className="plan-desk" />
            <circle cx={dx + 11} cy={dy + 17} r={3.5} className="plan-person" />
          </g>
        );
      })}
      {room.dept === 'hr' &&
        room.extra >= 2 &&
        Array.from({ length: room.extra }, (_, k) => (
          <rect
            key={`t${k}`}
            x={inner.x + inner.w - 14}
            y={inner.y + 18 + k * 9}
            width={8}
            height={6}
            className="plan-extra"
          />
        ))}
      {room.dept === 'board' && (
        <ellipse
          cx={inner.x + inner.w / 2}
          cy={inner.y + inner.h / 2 + 6}
          rx={inner.w / 4}
          ry={8}
          className="plan-extra"
        />
      )}
    </g>
  );
}

/** Mặt bằng cửa hàng: quầy và nhân viên, ghế có khách theo khách phục vụ, hàng chờ ngoài cửa theo khách mất. */
export const StorePlan = memo(function StorePlan(props: {
  staff: number;
  capacity: number;
  served: number;
  lost: number;
  /** Tiện ích đang bật (U5): hiện ký hiệu trên sơ đồ. */
  amenities?: readonly string[];
}) {
  const baristas = Math.min(props.staff, 10);
  const seats = 24;
  const filled =
    props.capacity > 0 ? Math.round((Math.min(props.served, props.capacity) / props.capacity) * seats) : 0;
  const queue = Math.min(12, Math.round(props.lost / 10));
  return (
    <svg
      className="plan"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Cửa hàng: ${props.staff} nhân viên, ${filled}/${seats} chỗ có khách, ${queue > 0 ? `hàng chờ ${queue}` : 'không có hàng chờ'}`}
      data-testid="store-plan"
    >
      <rect x={6} y={6} width={W - 70} height={H - 12} className="plan-wall" />
      {/* quầy */}
      <rect x={18} y={16} width={W - 100} height={14} rx={3} className="plan-counter" />
      {Array.from({ length: baristas }, (_, k) => (
        <circle
          key={`b${k}`}
          cx={30 + k * (baristas > 1 ? (W - 124) / (baristas - 1) : 0)}
          cy={40}
          r={4}
          className="plan-staff"
        />
      ))}
      {props.staff > baristas && (
        <text x={W - 78} y={44} className="plan-label" textAnchor="end">
          +{props.staff - baristas}
        </text>
      )}
      {/* bàn: 6 bàn × 4 ghế */}
      {Array.from({ length: 6 }, (_, t) => {
        const tx = 34 + (t % 3) * 86;
        const ty = 72 + Math.floor(t / 3) * 50;
        return (
          <g key={`t${t}`}>
            <rect x={tx} y={ty} width={36} height={22} rx={4} className="plan-desk" />
            {[0, 1, 2, 3].map((s) => {
              const seat = t * 4 + s;
              const sx = tx + (s % 2 === 0 ? -7 : 43);
              const sy = ty + (s < 2 ? 5 : 17);
              return (
                <circle
                  key={s}
                  cx={sx}
                  cy={sy}
                  r={4}
                  className={seat < filled ? 'plan-person' : 'plan-seat'}
                />
              );
            })}
          </g>
        );
      })}
      {/* cửa + hàng chờ ngoài */}
      <rect x={W - 66} y={H / 2 - 14} width={6} height={28} className="plan-door" />
      {Array.from({ length: queue }, (_, k) => (
        <circle
          key={`q${k}`}
          cx={W - 48 + (k % 3) * 14}
          cy={22 + Math.floor(k / 3) * 14}
          r={4}
          className="plan-queue"
        />
      ))}
      {queue > 0 && (
        <text x={W - 34} y={H - 14} textAnchor="middle" className="plan-label">
          chờ
        </text>
      )}
      {(props.amenities ?? []).slice(0, 4).map((a, k) => (
        <text key={a} x={20 + k * 70} y={H - 12} className="plan-amenity">
          {a}
        </text>
      ))}
    </svg>
  );
});
