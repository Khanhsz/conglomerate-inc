import { useEffect, useRef, useState } from 'react';

export interface SliderProps {
  readonly id: string;
  readonly label: string;
  /** Giá trị thật (cent, số người…), luôn là số nguyên. */
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly format: (value: number) => string;
  /** Gọi liên tục khi đang kéo (để xem ước tính). */
  readonly onPreview?: (value: number) => void;
  /** Gọi một lần khi thả tay / nhả phím, nếu giá trị đổi. */
  readonly onCommit: (value: number) => void;
  /** Gọi khi kết thúc một lần kéo (có đổi hay không). */
  readonly onRelease?: () => void;
  /** Thang tùy chỉnh (ví dụ bậc ba cho marketing): vị trí ↔ giá trị. */
  readonly scale?: {
    readonly toPosition: (v: number) => number;
    readonly fromPosition: (p: number) => number;
    readonly track: number;
  };
  readonly disabled?: boolean;
}

/**
 * Thanh kéo: kéo để xem trước, thả để gửi lệnh. Dùng sự kiện `change` gốc (bắn khi thả chuột hoặc nhả phím)
 * để gửi lệnh, còn `input` để xem trước. Sau khi gửi có nút hoàn tác về giá trị cũ.
 */
export function Slider(props: SliderProps) {
  const ref = useRef<HTMLInputElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const [draft, setDraft] = useState<number | null>(null);
  const [undo, setUndo] = useState<number | null>(null);
  const toPos = (v: number) => (props.scale ? props.scale.toPosition(v) : v);
  const fromPos = (p: number) => (props.scale ? props.scale.fromPosition(p) : p);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onChange = () => {
      const p = latest.current;
      const next = p.scale ? p.scale.fromPosition(Number(el.value)) : Number(el.value);
      setDraft(null);
      if (next !== p.value) {
        setUndo(p.value);
        p.onCommit(next);
      }
      p.onRelease?.();
    };
    el.addEventListener('change', onChange);
    return () => el.removeEventListener('change', onChange);
  }, []);

  const shown = draft ?? props.value;
  const outOfBand = props.value < props.min || props.value > props.max;
  return (
    <div className="slider">
      <label htmlFor={props.id} className="slider-label">
        <span>{props.label}</span>
        <output htmlFor={props.id} className={`slider-value ${draft !== null ? 'drafting' : ''}`}>
          {props.format(shown)}
        </output>
      </label>
      <input
        ref={ref}
        id={props.id}
        data-testid={props.id}
        type="range"
        min={props.scale ? 0 : props.min}
        max={props.scale ? props.scale.track : props.max}
        step={props.scale ? 1 : props.step}
        value={toPos(Math.min(props.max, Math.max(props.min, shown)))}
        disabled={props.disabled}
        aria-valuetext={props.format(shown)}
        onChange={(e) => {
          const next = fromPos(Number(e.target.value));
          setDraft(next);
          props.onPreview?.(next);
        }}
      />
      <div className="slider-scale muted">
        <span>{props.format(props.min)}</span>
        {outOfBand && <span className="bad">giá trị hiện tại ngoài dải mới</span>}
        {undo !== null && undo !== props.value && (
          <button
            type="button"
            className="link"
            onClick={() => {
              props.onCommit(undo);
              setUndo(null);
            }}
          >
            ↶ Hoàn tác về {props.format(undo)}
          </button>
        )}
        <span>{props.format(props.max)}</span>
      </div>
    </div>
  );
}
