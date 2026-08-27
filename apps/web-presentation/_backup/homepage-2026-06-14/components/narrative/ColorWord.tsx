"use client";

import type { CSSProperties } from "react";

export type ColorWordProps = {
  text: string;
  auraColor?: string;
  active?: boolean;
  intensity?: number;
  onSelect?: (text: string) => void;
};

export function ColorWord({
  text,
  auraColor = "#B7C7FF",
  active = false,
  intensity = 1,
  onSelect,
}: ColorWordProps) {
  const style = {
    "--word-aura": auraColor,
    "--word-intensity": String(Math.max(0, Math.min(1, intensity))),
  } as CSSProperties;

  return (
    <button
      type="button"
      className={`color-word${active ? " color-word--active" : ""}`}
      style={style}
      aria-pressed={active}
      aria-label={`${text}. Select to read sensory description.`}
      onClick={() => onSelect?.(text)}
      onFocus={() => onSelect?.(text)}
    >
      <span className="color-word__aura" aria-hidden />
      <span className="color-word__label">{text}</span>
    </button>
  );
}
