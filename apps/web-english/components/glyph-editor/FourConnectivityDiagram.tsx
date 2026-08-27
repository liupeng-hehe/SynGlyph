"use client";

/**
 * 示意 4-连通：仅上下左右共边；对角共点不算连通（本工具分块不按 8-连通）。
 */
export function FourConnectivityDiagram() {
  const cell = 26;
  const gap = 2;
  const step = cell + gap;
  const labels = [
    ["×", "↑", "×"],
    ["←", "●", "→"],
    ["×", "↓", "×"],
  ];
  const kind: ("center" | "n4" | "diag")[][] = [
    ["diag", "n4", "diag"],
    ["n4", "center", "n4"],
    ["diag", "n4", "diag"],
  ];

  const w = 3 * step - gap;
  const h = w;

  return (
    <div className="flex shrink-0 flex-col gap-2">
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        className="overflow-visible text-[10px]"
        aria-hidden
      >
        <title>4-连通邻居示意</title>
        {kind.map((row, i) =>
          row.map((k, j) => {
            const x = j * step;
            const y = i * step;
            const fill =
              k === "center"
                ? "rgb(56, 189, 248)"
                : k === "n4"
                  ? "rgba(52, 211, 153, 0.45)"
                  : "rgba(63, 63, 70, 0.9)";
            const stroke = k === "diag" ? "rgb(113, 113, 122)" : "rgb(82, 82, 91)";
            return (
              <g key={`${i}-${j}`}>
                <rect x={x} y={y} width={cell} height={cell} rx={2} fill={fill} stroke={stroke} strokeWidth={1} />
                <text
                  x={x + cell / 2}
                  y={y + cell / 2 + 3}
                  textAnchor="middle"
                  fill={k === "center" ? "rgb(15, 23, 42)" : "rgb(228, 228, 231)"}
                  className="pointer-events-none select-none font-sans text-[11px]"
                >
                  {labels[i]![j]}
                </text>
              </g>
            );
          })
        )}
      </svg>
      <ul className="max-w-[14rem] list-inside list-disc space-y-0.5 text-[10px] leading-snug text-zinc-500">
        <li>
          <span className="text-emerald-400/90">绿格</span>：与中心<strong className="text-zinc-400">共边</strong>，算邻居 → 同一块可沿上下左右蔓延。
        </li>
        <li>
          <span className="text-zinc-500">灰格（×）</span>：仅<strong className="text-zinc-400">角碰角</strong> → <strong className="text-zinc-400">不算</strong>4-连通。
        </li>
      </ul>
    </div>
  );
}
