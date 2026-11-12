import { ALERT_KINDS, type AlertKind } from '../sim/alerts';
import type { Snapshot } from '../sim/snapshot';
import { useUi } from '../store';

const KIND_LABEL: Record<AlertKind, string> = {
  overloaded: 'Quá tải, mất khách',
  underused: 'Dư công suất',
  negativeContribution: 'Cửa hàng lỗ đóng góp',
  lowMorale: 'Tinh thần thấp',
  rivalNearby: 'Đối thủ mở cạnh bạn',
  cashForecast: 'Dự báo hết tiền',
};

export function AlertsPanel({ snap }: { snap: Snapshot }) {
  const { pauseOn, togglePause, openStore } = useUi();
  return (
    <section className="panel alerts" aria-labelledby="alerts-title">
      <h2 id="alerts-title">Cảnh báo vận hành</h2>
      {snap.alerts.length === 0 ? (
        <p className="muted">Không có gì cần xử lý.</p>
      ) : (
        <ul>
          {snap.alerts.map((a) => (
            <li key={a.key} className={`alert alert-${a.severity}`}>
              <span>{a.message}</span>
              {a.storeId && (
                <button
                  type="button"
                  className="link"
                  onClick={() => {
                    if (a.storeId) openStore(a.storeId, 'ops');
                  }}
                >
                  Xem
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <details>
        <summary>Tự tạm dừng khi có cảnh báo mới…</summary>
        <div className="pause-options">
          {ALERT_KINDS.map((k) => (
            <label key={k}>
              <input
                type="checkbox"
                id={`pause-${k}`}
                checked={pauseOn.includes(k)}
                onChange={() => togglePause(k)}
              />{' '}
              {KIND_LABEL[k]}
            </label>
          ))}
        </div>
      </details>
    </section>
  );
}
