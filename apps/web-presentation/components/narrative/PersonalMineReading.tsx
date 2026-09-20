"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";

import { ellipseVivid, letterShow, mineLetterStyle, planMineVisibility } from "@/lib/mineLetterVisual";
import { wordsForText, type MineGlyph, type MineWord } from "@/lib/paletteFieldV1";

type Props = {
  paragraphs: string[];
  active: boolean;
};

type Gaze = { x: number; y: number };

type Row = {
  paragraph: string;
  words: MineWord[];
};

function renderGlyph(glyph: MineGlyph, index: number, colored: boolean) {
  if (!colored || !glyph.hex) {
    return (
      <span key={index} className="personal-mine__glyph">
        {glyph.text}
      </span>
    );
  }
  return (
    <span
      key={index}
      className="personal-mine__glyph personal-mine__glyph--letter"
      style={mineLetterStyle(glyph.hex, glyph.prominence, glyph.spread)}
    >
      {glyph.text}
    </span>
  );
}

function renderWords(words: MineWord[], colored: boolean) {
  return words.map((word, wordIndex) => {
    if (word.isSpace) {
      return (
        <span key={`s-${wordIndex}`} className="personal-mine__glyph">
          {word.glyphs[0]?.text}
        </span>
      );
    }
    return (
      <span
        key={`w-${wordIndex}`}
        className="personal-mine__word"
        data-mine-word={colored ? "1" : undefined}
      >
        {word.glyphs.map((glyph, index) => renderGlyph(glyph, index, colored))}
      </span>
    );
  });
}

function wordDistance(rect: DOMRect, clientX: number, clientY: number): number {
  const dx = clientX < rect.left ? rect.left - clientX : clientX > rect.right ? clientX - rect.right : 0;
  const dy = clientY < rect.top ? rect.top - clientY : clientY > rect.bottom ? clientY - rect.bottom : 0;
  return Math.hypot(dx, dy);
}

type WordBox = {
  el: HTMLElement;
  id: number;
  rect: DOMRect;
};

function applyWordGaze(root: HTMLElement, clientX: number, clientY: number, litWords: Set<HTMLElement>): Set<HTMLElement> {
  const nodes = [...root.querySelectorAll<HTMLElement>("[data-mine-word]")];
  const boxes: WordBox[] = [];
  let hit: WordBox | null = null;
  let nearest: WordBox | null = null;
  let nearestDist = Infinity;

  for (const el of nodes) {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    const box = { el, id: boxes.length, rect };
    boxes.push(box);
    const onLine = clientY >= rect.top - rect.height * 0.35 && clientY <= rect.bottom + rect.height * 0.35;
    const inside = clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
    if (inside && !hit) hit = box;
    else if (onLine) {
      const dist = wordDistance(rect, clientX, clientY);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = box;
      }
    }
  }

  const current = hit ?? (nearestDist < 36 ? nearest : null);
  const nextLit = new Set<HTMLElement>();
  if (!current) {
    for (const el of litWords) clearWordShow(el);
    return nextLit;
  }

  boxes.sort((a, b) => (a.rect.top === b.rect.top ? a.rect.left - b.rect.left : a.rect.top - b.rect.top));
  const lineHeight = current.rect.height || 20;
  const layouts = boxes.map((box) => ({ box, line: 0, col: 0 }));
  let line = 0;
  let lineTop = boxes[0]?.rect.top ?? 0;
  let col = 0;
  for (const item of layouts) {
    if (item.box.rect.top - lineTop > lineHeight * 0.45) {
      line += 1;
      lineTop = item.box.rect.top;
      col = 0;
    }
    item.line = line;
    item.col = col;
    col += 1;
  }

  const planned = planMineVisibility(
    layouts.map((item) => ({
      id: item.box.id,
      line: item.line,
      col: item.col,
      letters: item.box.el.querySelectorAll(".personal-mine__glyph--letter").length,
    })),
    current.id,
  );

  const fontSize = parseFloat(getComputedStyle(current.el).fontSize) || 18;
  const rx = fontSize * 2.8;
  const ry = fontSize * 0.62;

  for (const item of layouts) {
    const base = planned.get(item.box.id);
    if (base == null) continue;
    const isCurrent = item.box.id === current.id;
    item.box.el.classList.add("personal-mine__word--on");
    nextLit.add(item.box.el);
    for (const letter of item.box.el.querySelectorAll<HTMLElement>(".personal-mine__glyph--letter")) {
      let vivid = 1;
      if (isCurrent) {
        const box = letter.getBoundingClientRect();
        vivid = ellipseVivid(
          clientX - (box.left + box.width / 2),
          clientY - (box.top + box.height / 2),
          rx,
          ry,
        );
      }
      letter.style.setProperty("--show", letterShow(base, isCurrent, vivid).toFixed(3));
    }
  }

  for (const el of litWords) {
    if (!nextLit.has(el)) clearWordShow(el);
  }
  return nextLit;
}

function clearWordShow(el: HTMLElement) {
  el.classList.remove("personal-mine__word--on");
  for (const letter of el.querySelectorAll<HTMLElement>(".personal-mine__glyph--letter")) {
    letter.style.setProperty("--show", "0");
  }
}

export function PersonalMineReading({ paragraphs, active }: Props) {
  const gazeRef = useRef<HTMLDivElement>(null);
  const colorRef = useRef<HTMLDivElement>(null);
  const litWordsRef = useRef<Set<HTMLElement>>(new Set());
  const lastClient = useRef<{ x: number; y: number } | null>(null);
  const frameRef = useRef<number | null>(null);
  const [gaze, setGaze] = useState<Gaze | null>(null);

  const rows = useMemo<Row[]>(
    () => paragraphs.map((paragraph) => ({ paragraph, words: wordsForText(paragraph) })),
    [paragraphs],
  );

  const paintGaze = useCallback((clientX: number, clientY: number) => {
    const node = gazeRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    setGaze({
      x: clientX - rect.left,
      y: clientY - rect.top,
    });
    const color = colorRef.current;
    if (!color) return;
    litWordsRef.current = applyWordGaze(color, clientX, clientY, litWordsRef.current);
  }, []);

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!active) return;
      lastClient.current = { x: event.clientX, y: event.clientY };
      if (frameRef.current != null) return;
      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null;
        const last = lastClient.current;
        if (!last) return;
        paintGaze(last.x, last.y);
      });
    },
    [active, paintGaze],
  );

  const clearGaze = useCallback(() => {
    lastClient.current = null;
    setGaze(null);
    for (const word of litWordsRef.current) clearWordShow(word);
    litWordsRef.current = new Set();
  }, []);

  useEffect(() => {
    if (!active) clearGaze();
  }, [active, clearGaze]);

  useEffect(() => {
    if (!active) return;
    const node = gazeRef.current;
    const copy = node?.closest(".personal-mine__copy");
    const onScroll = () => {
      const last = lastClient.current;
      if (!last) return;
      paintGaze(last.x, last.y);
    };
    copy?.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      copy?.removeEventListener("scroll", onScroll);
      window.removeEventListener("scroll", onScroll);
      if (frameRef.current != null) window.cancelAnimationFrame(frameRef.current);
    };
  }, [active, paintGaze]);

  const lit = active && gaze !== null;
  const gazeStyle = {
    "--gaze-x": gaze ? `${gaze.x}px` : "50%",
    "--gaze-y": gaze ? `${gaze.y}px` : "50%",
  } as CSSProperties;

  return (
    <div
      ref={gazeRef}
      className={`personal-mine__gaze${active ? " personal-mine__gaze--active" : ""}${lit ? " personal-mine__gaze--lit" : ""}`}
      style={gazeStyle}
      onPointerMove={onPointerMove}
      onPointerDown={onPointerMove}
      onPointerEnter={onPointerMove}
      onPointerLeave={clearGaze}
    >
      <div className="sr-only">
        {rows.map(({ paragraph }) => (
          <p key={paragraph.slice(0, 48)}>{paragraph}</p>
        ))}
      </div>
      <div className="personal-mine__ink" aria-hidden="true">
        {rows.map(({ paragraph, words }) => (
          <p key={paragraph.slice(0, 48)} className="narrative-body personal-mine__body m-0 font-body">
            {renderWords(words, false)}
          </p>
        ))}
      </div>
      {active ? (
        <div ref={colorRef} className="personal-mine__color" aria-hidden="true">
          {rows.map(({ paragraph, words }) => (
            <p key={paragraph.slice(0, 48)} className="narrative-body personal-mine__body m-0 font-body">
              {renderWords(words, true)}
            </p>
          ))}
        </div>
      ) : null}
      {lit ? <span className="personal-mine__dot" aria-hidden="true" /> : null}
    </div>
  );
}
