"use client";

import { useLayoutEffect, useRef } from "react";
import { InputGroupTextarea } from "./focus-ui/input-group";

function resizeComposer(field: HTMLTextAreaElement | null) {
  if (!field) return;
  field.style.height = "0px";
  field.style.height = `${field.scrollHeight}px`;
}

export function NavigatorComposerInput({ value, onValueChange, disabled }: {
  value: string;
  onValueChange: (_value: string) => void;
  disabled: boolean;
}) {
  const fieldRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => resizeComposer(fieldRef.current), [value]);
  useLayoutEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    let width = field.getBoundingClientRect().width;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry || entry.contentRect.width === width) return;
      width = entry.contentRect.width;
      resizeComposer(field);
    });
    observer.observe(field);
    return () => observer.disconnect();
  }, []);

  return <InputGroupTextarea
    ref={fieldRef}
    aria-label="Message Navigator"
    autoComplete="off"
    autoFocus
    rows={1}
    className="min-h-8 max-h-[min(8rem,30dvh)] min-w-0 overflow-y-auto overscroll-contain py-1 pl-1.5 text-base! leading-6 [field-sizing:fixed]"
    disabled={disabled}
    value={value}
    onChange={event => onValueChange(event.target.value)}
    onKeyDown={event => {
      if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing || event.keyCode === 229) return;
      event.preventDefault();
      if (!disabled && value.trim()) event.currentTarget.form?.requestSubmit();
    }}
    placeholder="Ask about a movie, show, or scene…"
  />;
}
