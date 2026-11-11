import { parseDisplay, toDisplay, type Money } from '@game/sim-core';
import { useEffect, useState } from 'react';

/** Ô nhập tiền: hiển thị bằng toDisplay, đọc bằng parseDisplay; Enter hoặc rời ô thì gửi. */
export function MoneyInput(props: {
  value: Money;
  onCommit: (value: Money) => void;
  label: string;
  testId?: string;
}) {
  const [text, setText] = useState(toDisplay(props.value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(toDisplay(props.value));
  }, [props.value, focused]);
  const parsed = parseDisplay(text);
  const commit = () => {
    setFocused(false);
    if (parsed !== null && parsed !== props.value) props.onCommit(parsed);
    else setText(toDisplay(props.value));
  };
  return (
    <input
      className={`num ${parsed === null ? 'invalid' : ''}`}
      aria-label={props.label}
      data-testid={props.testId}
      value={text}
      onFocus={() => setFocused(true)}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
    />
  );
}

/** Ô nhập số nguyên (số nhân viên). */
export function IntInput(props: {
  value: number;
  onCommit: (value: number) => void;
  label: string;
  min: number;
  max: number;
}) {
  const [text, setText] = useState(String(props.value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(String(props.value));
  }, [props.value, focused]);
  const n = Number(text);
  const valid = Number.isInteger(n) && n >= props.min && n <= props.max;
  const commit = () => {
    setFocused(false);
    if (valid && n !== props.value) props.onCommit(n);
    else setText(String(props.value));
  };
  return (
    <input
      className={`num short ${valid ? '' : 'invalid'}`}
      aria-label={props.label}
      inputMode="numeric"
      value={text}
      onFocus={() => setFocused(true)}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
    />
  );
}
