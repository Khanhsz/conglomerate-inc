import { SPEEDS, type Speed } from '../sim/protocol';
import type { Snapshot } from '../sim/snapshot';
import { useUi } from '../store';
import { usd } from '../format';

const SPEED_LABEL: Record<Speed, string> = { 0: '⏸ Tạm dừng', 1: '1×', 4: '4×', 16: '16×' };

export function TopBar({ snap }: { snap: Snapshot }) {
  const send = useUi((s) => s.send);
  const { calendar, player } = snap;
  return (
    <header className="topbar" data-day={calendar.day}>
      <strong className="brand">Conglomerate Inc.</strong>
      <span data-testid="calendar">
        Năm {calendar.year} · Tháng {calendar.month} · Ngày {calendar.dayOfMonth}
      </span>
      <span>
        Tiền <b>{usd(player.cash)}</b>
      </span>
      <span className={player.overdraft > 0 ? 'bad' : ''}>
        Thấu chi {usd(player.overdraft)} / hạn mức {usd(player.overdraftLimit)}
      </span>
      <span className={`status status-${player.status}`}>● {player.status}</span>
      <nav className="speeds" aria-label="Tốc độ">
        {SPEEDS.map((speed) => (
          <button
            key={speed}
            data-testid={`speed-${speed}`}
            aria-pressed={snap.speed === speed}
            onClick={() => send({ type: 'speed', speed })}
          >
            {SPEED_LABEL[speed]}
          </button>
        ))}
      </nav>
      {snap.pendingCommands > 0 && (
        <span className="muted">{snap.pendingCommands} lệnh chờ tick kế tiếp</span>
      )}
    </header>
  );
}
