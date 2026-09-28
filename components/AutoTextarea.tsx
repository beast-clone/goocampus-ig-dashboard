"use client";
import { useEffect, useRef } from "react";

// A textarea that grows to fit what is in it, so the whole thing is visible
// without an inner scrollbar.
//
// Lived inside the Scheduler for captions. Pulled out because the new-task form
// needed the same thing: "this content adding space is not expanding when I am
// adding content like airtable and I can't see the content in full here I have
// scroll through" (Manya, 28 Sep).
//
// Height recomputes whenever the value changes, so pasting or autofilling a long
// brief resizes it too — not just typing.
export function AutoTextarea({ value, onChange, placeholder, className, minHeight = 96, style, ...rest }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  /** Never shrink below this, so an empty box still looks like somewhere to write. */
  minHeight?: number;
  style?: React.CSSProperties;
} & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange" | "style">) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Collapse first, or scrollHeight only ever reports the previous (larger) size
    // and the box can grow but never shrink back.
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, minHeight)}px`;
  }, [value, minHeight]);
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={className}
      style={{ overflow: "hidden", resize: "none", minHeight, ...style }}
      {...rest}
    />
  );
}
