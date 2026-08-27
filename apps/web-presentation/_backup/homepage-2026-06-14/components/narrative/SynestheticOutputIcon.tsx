import type { Synesthesia3DFlow } from "@/content/synesthesia3DFlows";

export type SynestheticOutputIconProps = {
  icon: Synesthesia3DFlow["outputIcon"];
  className?: string;
};

export function SynestheticOutputIcon({
  icon,
  className = "",
}: SynestheticOutputIconProps) {
  return (
    <div
      className={`synesthetic-output-icon ${className}`.trim()}
      aria-hidden="true"
    >
      {renderIcon(icon)}
    </div>
  );
}

function renderIcon(icon: Synesthesia3DFlow["outputIcon"]) {
  switch (icon) {
    case "colorSwatches":
      return <ColorSwatchesIcon />;
    case "soundColor":
      return <SoundColorIcon />;
    case "calendarMap":
      return <CalendarMapIcon />;
    case "symbolPersonality":
      return <SymbolPersonalityIcon />;
    case "tasteObjects":
      return <TasteObjectsIcon />;
    case "soundTouch":
      return <SoundTouchIcon />;
    case "mirrorBodies":
      return <MirrorBodiesIcon />;
    case "conceptShapes":
      return <ConceptShapesIcon />;
    case "bodyMotion":
      return <BodyMotionIcon />;
    default:
      return null;
  }
}

function ColorSwatchesIcon() {
  const swatches = [
    { label: "A", color: "#E74C3C" },
    { label: "5", color: "#2ECC71" },
    { label: "M", color: "#9B59B6" },
    { label: "7", color: "#3498DB" },
  ];
  return (
    <svg viewBox="0 0 200 72" className="synesthetic-output-icon__canvas">
      {swatches.map((s, i) => (
        <g key={s.label} transform={`translate(${i * 48 + 4}, 8)`}>
          <rect
            className="synesthetic-output-icon__swatch-aura"
            x="-2"
            y="-2"
            width="40"
            height="52"
            rx="4"
            fill={s.color}
            opacity="0.18"
          />
          <rect
            className="synesthetic-output-icon__swatch"
            x="0"
            y="0"
            width="36"
            height="48"
            rx="3"
            fill={s.color}
            opacity="0.75"
            stroke="var(--ink)"
            strokeWidth="1.2"
          />
          <text
            className="synesthetic-output-icon__label"
            x="18"
            y="28"
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {s.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

function SoundColorIcon() {
  return (
    <svg viewBox="0 0 200 72" className="synesthetic-output-icon__canvas">
      <path
        className="synesthetic-output-icon__wave"
        d="M8 40 C20 20, 32 60, 44 40 S68 20, 80 40"
        fill="none"
        stroke="var(--ink)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <text className="synesthetic-output-icon__label" x="8" y="58" fontSize="8">
        ♪
      </text>
      <path
        d="M88 36 C110 18, 130 50, 155 28"
        fill="none"
        stroke="#FFD447"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.85"
      />
      <ellipse cx="168" cy="24" rx="14" ry="8" fill="#00B8D9" opacity="0.35" />
      <ellipse cx="178" cy="38" rx="10" ry="14" fill="#C9B7FF" opacity="0.4" />
      <path
        d="M160 48 C175 42, 188 55, 195 44"
        fill="none"
        stroke="#FF9F1C"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.7"
      />
    </svg>
  );
}

function CalendarMapIcon() {
  const chips = [
    { label: "Mon", x: 18, y: 48 },
    { label: "Tue", x: 52, y: 28 },
    { label: "Wed", x: 88, y: 22 },
    { label: "Apr", x: 128, y: 32 },
    { label: "Oct", x: 168, y: 50 },
  ];
  return (
    <svg viewBox="0 0 200 72" className="synesthetic-output-icon__canvas">
      <path
        d="M12 52 C40 18, 100 8, 155 28 C185 40, 192 55, 188 58"
        fill="none"
        stroke="var(--ink)"
        strokeWidth="1.4"
        strokeDasharray="4 3"
        opacity="0.5"
      />
      <path
        d="M12 52 C40 18, 100 8, 155 28 C185 40, 192 55, 188 58"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {chips.map((c) => (
        <g key={c.label}>
          <rect
            x={c.x - 14}
            y={c.y - 10}
            width="28"
            height="18"
            rx="9"
            fill="var(--surface)"
            stroke="var(--ink-soft)"
            strokeWidth="1"
          />
          <text
            className="synesthetic-output-icon__label"
            x={c.x}
            y={c.y + 2}
            textAnchor="middle"
            fontSize="7"
          >
            {c.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

function SymbolPersonalityIcon() {
  const items = [
    { sym: "4", tag: "stern", x: 28 },
    { sym: "9", tag: "elegant", x: 88 },
    { sym: "B", tag: "young", x: 148 },
  ];
  return (
    <svg viewBox="0 0 200 72" className="synesthetic-output-icon__canvas">
      {items.map((item) => (
        <g key={item.sym} transform={`translate(${item.x}, 16)`}>
          <circle
            cx="0"
            cy="12"
            r="16"
            fill="var(--surface)"
            stroke="var(--ink)"
            strokeWidth="1.4"
          />
          <text
            className="synesthetic-output-icon__label"
            x="0"
            y="16"
            textAnchor="middle"
            fontSize="14"
            fontWeight="600"
          >
            {item.sym}
          </text>
          <rect
            x="-22"
            y="34"
            width="44"
            height="16"
            rx="8"
            fill="rgb(255 212 71 / 0.2)"
            stroke="var(--ink-soft)"
            strokeWidth="0.8"
          />
          <text
            className="synesthetic-output-icon__label"
            x="0"
            y="45"
            textAnchor="middle"
            fontSize="7"
          >
            {item.tag}
          </text>
        </g>
      ))}
    </svg>
  );
}

function TasteObjectsIcon() {
  return (
    <svg viewBox="0 0 200 72" className="synesthetic-output-icon__canvas">
      {/* strawberry */}
      <g transform="translate(12, 14)" className="synesthetic-output-icon__object">
        <path
          d="M12 8 C8 14, 6 22, 10 30 C14 36, 20 36, 24 30 C28 22, 26 14, 22 8 Z"
          fill="#FF6B6B"
          opacity="0.6"
          stroke="var(--ink)"
          strokeWidth="1"
        />
        <path d="M14 6 L18 2 L22 6" fill="none" stroke="#2ECC71" strokeWidth="1.2" />
      </g>
      {/* salt shaker */}
      <g transform="translate(48, 10)" className="synesthetic-output-icon__object">
        <rect x="6" y="14" width="14" height="22" rx="2" fill="var(--surface)" stroke="var(--ink)" strokeWidth="1.2" />
        <rect x="8" y="4" width="10" height="12" rx="1" fill="var(--surface)" stroke="var(--ink)" strokeWidth="1.2" />
        <circle cx="13" cy="8" r="1.5" fill="var(--ink-muted)" />
      </g>
      {/* lemon slice */}
      <g transform="translate(88, 16)" className="synesthetic-output-icon__object">
        <circle cx="14" cy="14" r="14" fill="#FFD447" opacity="0.5" stroke="var(--ink)" strokeWidth="1.2" />
        <path d="M14 4 L14 24 M6 10 L22 18 M6 18 L22 10" stroke="var(--ink)" strokeWidth="0.8" opacity="0.4" />
      </g>
      {/* milk glass */}
      <g transform="translate(128, 12)" className="synesthetic-output-icon__object">
        <path d="M8 8 L10 40 L26 40 L28 8 Z" fill="#F5F0E6" stroke="var(--ink)" strokeWidth="1.2" />
        <path d="M8 8 L28 8" stroke="var(--ink)" strokeWidth="1.4" />
        <ellipse cx="18" cy="24" rx="6" ry="8" fill="#FFF" opacity="0.6" />
      </g>
      {/* metal spoon */}
      <g transform="translate(168, 18)" className="synesthetic-output-icon__object">
        <ellipse cx="8" cy="8" rx="8" ry="10" fill="#B0B8C8" opacity="0.5" stroke="var(--ink)" strokeWidth="1" />
        <rect x="6" y="16" width="4" height="22" rx="2" fill="#9AA3B5" stroke="var(--ink)" strokeWidth="0.8" />
      </g>
    </svg>
  );
}

function SoundTouchIcon() {
  return (
    <svg viewBox="0 0 200 72" className="synesthetic-output-icon__canvas">
      <path
        className="synesthetic-output-icon__wave"
        d="M8 36 C18 22, 28 50, 38 36 S58 22, 68 36"
        fill="none"
        stroke="var(--ink)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <g transform="translate(100, 8)" className="synesthetic-output-icon__body">
        <path
          d="M30 8 C38 6, 48 12, 50 24 C52 36, 44 48, 36 52 C28 56, 18 50, 16 38 C14 26, 22 10, 30 8 Z"
          fill="none"
          stroke="var(--ink)"
          strokeWidth="1.4"
        />
        <path
          d="M20 28 C24 24, 30 26, 32 32"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeLinecap="round"
        />
        {[0, 1, 2].map((i) => (
          <path
            key={i}
            d={`M${58 + i * 6} ${30 + i * 4} Q${68 + i * 4} ${24 + i * 6} ${78 + i * 2} ${32 + i * 3}`}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="1.2"
            opacity={0.7 - i * 0.15}
          />
        ))}
      </g>
    </svg>
  );
}

function MirrorBodiesIcon() {
  return (
    <svg viewBox="0 0 200 72" className="synesthetic-output-icon__canvas">
      <g transform="translate(24, 6)" className="synesthetic-output-icon__body">
        <text className="synesthetic-output-icon__label" x="20" y="6" fontSize="6" textAnchor="middle">
          observed
        </text>
        <ellipse cx="20" cy="18" rx="10" ry="12" fill="none" stroke="var(--ink)" strokeWidth="1.2" />
        <path d="M20 30 L20 48 M12 38 L28 38" stroke="var(--ink)" strokeWidth="1.2" strokeLinecap="round" />
        <circle cx="28" cy="36" r="4" fill="rgb(255 212 71 / 0.35)" stroke="var(--accent)" strokeWidth="1.2" />
      </g>
      <line x1="100" y1="20" x2="100" y2="58" stroke="var(--ink-soft)" strokeWidth="1" strokeDasharray="3 3" />
      <g transform="translate(116, 6)" className="synesthetic-output-icon__body">
        <text className="synesthetic-output-icon__label" x="20" y="6" fontSize="6" textAnchor="middle">
          felt
        </text>
        <ellipse cx="20" cy="18" rx="10" ry="12" fill="none" stroke="var(--ink)" strokeWidth="1.2" />
        <path d="M20 30 L20 48 M12 38 L28 38" stroke="var(--ink)" strokeWidth="1.2" strokeLinecap="round" />
        <circle cx="12" cy="36" r="4" fill="rgb(255 212 71 / 0.45)" stroke="var(--accent)" strokeWidth="1.5" />
      </g>
      <path
        d="M52 42 C72 38, 88 40, 108 42"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="1.8"
        strokeDasharray="4 3"
      />
    </svg>
  );
}

function ConceptShapesIcon() {
  const shapes = [
    { word: "justice", shape: "triangle", x: 8 },
    { word: "anxiety", shape: "spiral", x: 72 },
    { word: "memory", shape: "cube", x: 136 },
  ];
  return (
    <svg viewBox="0 0 200 72" className="synesthetic-output-icon__canvas">
      {shapes.map((s) => (
        <g key={s.word} transform={`translate(${s.x}, 8)`}>
          <rect x="0" y="0" width="48" height="14" rx="7" fill="var(--surface)" stroke="var(--ink-soft)" strokeWidth="0.8" />
          <text className="synesthetic-output-icon__label" x="24" y="10" textAnchor="middle" fontSize="6">
            {s.word}
          </text>
          <g transform="translate(24, 38)" className="synesthetic-output-icon__shape">
            {s.shape === "triangle" && (
              <path d="M0 -12 L12 10 L-12 10 Z" fill="rgb(0 184 217 / 0.25)" stroke="var(--ink)" strokeWidth="1.2" />
            )}
            {s.shape === "spiral" && (
              <path
                d="M0 0 C6 -8, 14 -4, 10 4 C6 12, -4 10, -6 2 C-8 -6, 2 -10, 8 -4"
                fill="none"
                stroke="var(--ink)"
                strokeWidth="1.4"
              />
            )}
            {s.shape === "cube" && (
              <path
                d="M-10 4 L0 -8 L14 -2 L4 14 Z M0 -8 L4 14 M14 -2 L4 14 M-10 4 L4 14"
                fill="rgb(134 217 255 / 0.2)"
                stroke="var(--ink)"
                strokeWidth="1"
              />
            )}
          </g>
        </g>
      ))}
    </svg>
  );
}

function BodyMotionIcon() {
  return (
    <svg viewBox="0 0 200 72" className="synesthetic-output-icon__canvas">
      <g transform="translate(8, 12)">
        <rect x="0" y="0" width="56" height="40" rx="4" fill="var(--surface)" stroke="var(--ink-soft)" strokeWidth="1" />
        <text className="synesthetic-output-icon__label" x="28" y="14" textAnchor="middle" fontSize="7">
          x + y = z
        </text>
        <path d="M8 28 L20 28 M8 34 L32 34" stroke="var(--ink-muted)" strokeWidth="1" />
        <path d="M40 20 L48 28 L40 36" fill="none" stroke="var(--accent)" strokeWidth="1.5" />
      </g>
      <g transform="translate(88, 8)" className="synesthetic-output-icon__body">
        <path
          d="M20 8 C28 6, 36 14, 34 26"
          fill="none"
          stroke="var(--ink)"
          strokeWidth="1.4"
        />
        <path
          d="M8 32 C16 28, 28 30, 36 24 C44 18, 52 22, 58 18"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M48 40 C52 48, 58 52, 64 46"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="1.6"
          strokeLinecap="round"
          opacity="0.7"
        />
      </g>
    </svg>
  );
}
