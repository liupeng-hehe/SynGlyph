"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

export type FocusWheelItem = {
  id: string;
  label: string;
};

type Props = {
  items: FocusWheelItem[];
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  detail: ReactNode;
  ariaLabel?: string;
  labelVariant?: "display" | "body";
};

const ITEM_STEP = 76;

function itemMotion(offset: number): CSSProperties {
  const abs = Math.abs(offset);
  const rotateX = offset * -20;
  const translateY = offset * ITEM_STEP;
  const scale = Math.max(0.52, 1 - abs * 0.15);
  const opacity = Math.max(0.1, 1 - abs * 0.34);
  const blur = Math.min(14, abs * 5.5);

  return {
    transform: `translate3d(0, ${translateY}px, 0) perspective(920px) rotateX(${rotateX}deg) scale(${scale})`,
    opacity,
    filter: blur > 0.4 ? `blur(${blur}px)` : undefined,
    zIndex: 20 - abs,
  };
}

export function VerticalFocusWheel({
  items,
  activeIndex,
  onActiveIndexChange,
  detail,
  ariaLabel = "Focus wheel",
  labelVariant = "display",
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const lockRef = useRef(false);
  const [animating, setAnimating] = useState(false);

  const clampIndex = useCallback(
    (next: number) => Math.max(0, Math.min(items.length - 1, next)),
    [items.length],
  );

  const goTo = useCallback(
    (next: number) => {
      const clamped = clampIndex(next);
      if (clamped === activeIndex) return;
      setAnimating(true);
      onActiveIndexChange(clamped);
      window.setTimeout(() => setAnimating(false), 520);
    },
    [activeIndex, clampIndex, onActiveIndexChange],
  );

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const onWheel = (event: WheelEvent) => {
      const rect = root.getBoundingClientRect();
      const inView =
        rect.top < window.innerHeight * 0.55 &&
        rect.bottom > window.innerHeight * 0.45;

      if (!inView) return;

      const goingDown = event.deltaY > 0;
      const atStart = activeIndex <= 0;
      const atEnd = activeIndex >= items.length - 1;

      if ((goingDown && !atEnd) || (!goingDown && !atStart)) {
        event.preventDefault();
        event.stopPropagation();
        if (lockRef.current) return;
        lockRef.current = true;
        goTo(activeIndex + (goingDown ? 1 : -1));
        window.setTimeout(() => {
          lockRef.current = false;
        }, 480);
      }
    };

    root.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => root.removeEventListener("wheel", onWheel, { capture: true });
  }, [activeIndex, goTo, items.length]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let touchY = 0;
    const onTouchStart = (event: TouchEvent) => {
      touchY = event.touches[0]?.clientY ?? 0;
    };
    const onTouchMove = (event: TouchEvent) => {
      const rect = root.getBoundingClientRect();
      const inView =
        rect.top < window.innerHeight * 0.55 &&
        rect.bottom > window.innerHeight * 0.45;
      if (!inView) return;

      const y = event.touches[0]?.clientY ?? touchY;
      const delta = touchY - y;
      if (Math.abs(delta) < 28) return;

      const goingDown = delta > 0;
      const atStart = activeIndex <= 0;
      const atEnd = activeIndex >= items.length - 1;

      if ((goingDown && !atEnd) || (!goingDown && !atStart)) {
        event.preventDefault();
        goTo(activeIndex + (goingDown ? 1 : -1));
        touchY = y;
      }
    };

    root.addEventListener("touchstart", onTouchStart, { passive: true });
    root.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      root.removeEventListener("touchstart", onTouchStart);
      root.removeEventListener("touchmove", onTouchMove);
    };
  }, [activeIndex, goTo, items.length]);

  return (
    <div
      ref={rootRef}
      className={`focus-wheel${animating ? " focus-wheel--animating" : ""}`}
      data-scroll-interaction
      aria-label={ariaLabel}
    >
      <div className="focus-wheel__stage" aria-live="polite">
        <ul className="focus-wheel__list m-0 list-none p-0">
          {items.map((item, index) => {
            const offset = index - activeIndex;
            if (Math.abs(offset) > 4) return null;
            const isActive = index === activeIndex;

            return (
              <li key={item.id} className="focus-wheel__item">
                <button
                  type="button"
                  className={`focus-wheel__label focus-wheel__label--${labelVariant}${isActive ? " focus-wheel__label--active" : ""}${labelVariant === "body" ? " font-body" : " font-display"}`}
                  style={itemMotion(offset)}
                  aria-current={isActive ? "true" : undefined}
                  tabIndex={isActive ? 0 : -1}
                  onClick={() => goTo(index)}
                >
                  {item.label}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="focus-wheel__detail">{detail}</div>
    </div>
  );
}
