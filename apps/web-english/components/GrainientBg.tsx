"use client";

function hexWithoutHash(hex: string) {
  return hex.replace(/^#/, "");
}

export function GrainientBg({
  colors = [],
  children,
  className = "",
}: {
  colors?: string[];
  children: React.ReactNode;
  className?: string;
}) {
  const defaultGradients = [
    "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(120, 60, 180, 0.4), transparent)",
    "radial-gradient(ellipse 60% 40% at 100% 50%, rgba(180, 80, 200, 0.3), transparent)",
    "radial-gradient(ellipse 50% 30% at 0% 80%, rgba(100, 50, 150, 0.25), transparent)",
  ];
  const getPosition = (i: number, n: number) => {
    if (n <= 0) return ["50%", "50%"];
    const angle = (i / n) * 2 * Math.PI * 0.618;
    const r = 35 + (i % 3) * 15;
    return [`${50 + r * Math.cos(angle)}%`, `${50 + r * Math.sin(angle)}%`];
  };
  const gradients =
    colors.length > 0
      ? colors.map((hex, i) => {
          const h = hexWithoutHash(hex).padStart(6, "0");
          const r = parseInt(h.slice(0, 2), 16);
          const g = parseInt(h.slice(2, 4), 16);
          const b = parseInt(h.slice(4, 6), 16);
          const [x, y] = getPosition(i, colors.length);
          return `radial-gradient(ellipse 70% 50% at ${x} ${y}, rgba(${r}, ${g}, ${b}, 0.4), transparent)`;
        })
      : defaultGradients;
  return (
    <div
      className={className}
      style={{ background: "#0d0a14", position: "relative", overflow: "hidden", minHeight: "100vh" }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: gradients.join(", ") }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
