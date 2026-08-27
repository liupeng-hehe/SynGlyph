"use client";

/** Left rail: shows rough component labels (e.g. 礻 / 畐) matching two-tone stroke coloring. */
export function ComponentSidebar({
  leftLabel,
  rightLabel,
  leftHint,
  rightHint,
}: {
  leftLabel: string;
  rightLabel: string;
  leftHint?: string;
  rightHint?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-4 pt-4">
      <p className="text-center text-[11px] font-medium uppercase tracking-wide text-stone-500">部件</p>
      <div className="flex flex-col gap-3">
        <div
          className="flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-lg border-2 border-dashed border-amber-200/80 bg-white shadow-sm"
          title={leftHint}
        >
          <span className="font-serif text-[2.1rem] leading-none text-blue-600">{leftLabel}</span>
        </div>
        <div
          className="flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-lg border-2 border-dashed border-amber-200/80 bg-white shadow-sm"
          title={rightHint}
        >
          <span className="font-serif text-[2.1rem] leading-none text-green-700">{rightLabel}</span>
        </div>
      </div>
    </div>
  );
}
