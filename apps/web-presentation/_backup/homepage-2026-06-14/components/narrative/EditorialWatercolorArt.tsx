"use client";

export function EditorialWatercolorArt() {
  return (
    <div className="editorial-watercolor" aria-hidden="true">
      <svg
        className="editorial-watercolor__svg"
        viewBox="0 0 520 640"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <filter id="wc-blur-heavy" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="18" />
          </filter>
          <filter id="wc-blur-soft" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="8" />
          </filter>
          <linearGradient id="wc-splash" x1="30%" y1="0%" x2="70%" y2="100%">
            <stop offset="0%" stopColor="#002FA7" stopOpacity="0.92" />
            <stop offset="28%" stopColor="#4A3F9E" stopOpacity="0.78" />
            <stop offset="52%" stopColor="#C45C7A" stopOpacity="0.72" />
            <stop offset="78%" stopColor="#E8A04A" stopOpacity="0.68" />
            <stop offset="100%" stopColor="#FFD447" stopOpacity="0.55" />
          </linearGradient>
          <radialGradient id="wc-core" cx="45%" cy="35%" r="55%">
            <stop offset="0%" stopColor="#0038C4" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#002FA7" stopOpacity="0" />
          </radialGradient>
        </defs>

        <ellipse
          cx="290"
          cy="300"
          rx="210"
          ry="260"
          fill="url(#wc-splash)"
          filter="url(#wc-blur-heavy)"
          opacity="0.88"
        />
        <ellipse
          cx="250"
          cy="220"
          rx="140"
          ry="170"
          fill="url(#wc-core)"
          filter="url(#wc-blur-soft)"
          opacity="0.7"
        />
        <ellipse
          cx="340"
          cy="420"
          rx="120"
          ry="150"
          fill="#E8847A"
          filter="url(#wc-blur-soft)"
          opacity="0.35"
        />

        <g stroke="#E8C96A" strokeWidth="0.9" fill="none" opacity="0.55">
          <path d="M120 80 A200 200 0 0 1 420 120" />
          <path d="M90 140 A240 240 0 0 1 440 200" />
          <path d="M70 200 A280 280 0 0 1 460 280" />
          <path d="M60 260 A300 300 0 0 1 470 360" />
        </g>

        <g stroke="#D4A82E" strokeWidth="0.7" fill="none" opacity="0.4">
          <path d="M100 480 Q180 500 260 490 T420 510" />
          <path d="M80 520 Q200 540 300 525 T450 545" />
          <path d="M110 560 Q220 575 320 565 T460 580" />
        </g>

        <circle cx="380" cy="120" r="3" fill="#002FA7" opacity="0.35" />
        <circle cx="140" cy="380" r="2.5" fill="#D9774A" opacity="0.4" />
      </svg>

      <div className="editorial-watercolor__margin">
        <span className="editorial-watercolor__tick">+</span>
        <span className="editorial-watercolor__rule" />
        <span className="editorial-watercolor__vlabel">
          perceptual overlap
        </span>
      </div>
    </div>
  );
}
