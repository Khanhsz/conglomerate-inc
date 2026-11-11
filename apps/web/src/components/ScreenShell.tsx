import type { ReactNode } from 'react';

export interface TabDef<T extends string> {
  readonly id: T;
  readonly label: string;
  /** Phòng chưa mở / chức năng chưa có: vẫn bấm được, hiện trang khóa. */
  readonly locked?: boolean;
}

/**
 * Khung một màn hình (M1.7): tiêu đề + nút đóng, phần thân, thanh tab.
 * Điện thoại: tab cố định ở đáy; desktop: tab thành cột bên trái.
 */
export function ScreenShell<T extends string>(props: {
  title: string;
  subtitle?: string;
  testId: string;
  tabs: readonly TabDef<T>[];
  active: T;
  tabTestPrefix: string;
  onTab: (tab: T) => void;
  onClose: () => void;
  advisor?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="screen" data-testid={props.testId} aria-labelledby={`${props.testId}-title`}>
      <header className="screen-head">
        <div>
          <h2 id={`${props.testId}-title`}>{props.title}</h2>
          {props.subtitle && <p className="muted small">{props.subtitle}</p>}
        </div>
        <button
          type="button"
          className="close"
          data-testid="close-screen"
          aria-label="Về bản đồ"
          onClick={props.onClose}
        >
          ✕
        </button>
      </header>
      <nav className="tabbar" role="tablist" aria-label={props.title}>
        {props.tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            data-testid={`${props.tabTestPrefix}${t.id}`}
            aria-selected={t.id === props.active}
            className={t.locked ? 'locked' : ''}
            onClick={() => props.onTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <div className="screen-body">
        {props.advisor}
        {props.children}
      </div>
    </section>
  );
}
