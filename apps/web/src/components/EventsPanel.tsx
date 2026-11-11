import type { Snapshot } from '../sim/snapshot';
import { useUi } from '../store';
import { eventText } from '../format';

export function EventsPanel({ snap }: { snap: Snapshot }) {
  const { notices, dismissNotice } = useUi();
  const names = Object.fromEntries(snap.companies.map((c) => [c.id, c.name]));
  return (
    <section className="panel events">
      <h2>Sự kiện</h2>
      {notices.map((n) => (
        <p key={n.id} className={`notice ${n.level}`}>
          {n.message}{' '}
          <button onClick={() => dismissNotice(n.id)} aria-label="Đóng thông báo">
            ×
          </button>
        </p>
      ))}
      <ol>
        {snap.events.map((e, i) => (
          <li
            key={`${e.day}-${i}`}
            className={`event event-${e.kind} ${e.companyId === snap.player.id ? 'mine' : ''}`}
          >
            <span className="muted">ngày {e.day}</span> {eventText(e, names, snap.player.id)}
          </li>
        ))}
      </ol>
    </section>
  );
}
