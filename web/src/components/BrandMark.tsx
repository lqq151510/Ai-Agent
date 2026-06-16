import React, { useId } from "react";

interface BrandMarkProps {
  size?: number;
  className?: string;
  title?: string | null;
}

export function BrandMark({
  size = 64,
  className,
  title = "AI + Java Dev Coach",
}: BrandMarkProps) {
  const baseId = useId().replace(/:/g, "");
  const shellGradientId = `${baseId}-shell`;
  const glyphGradientId = `${baseId}-glyph`;
  const titleId = `${baseId}-title`;
  const labelled = Boolean(title);

  const classes = ["brand-mark-svg", className].filter(Boolean).join(" ");

  return (
    <svg
      className={classes}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      focusable="false"
      aria-labelledby={labelled ? titleId : undefined}
      aria-hidden={labelled ? undefined : true}
    >
      {labelled ? <title id={titleId}>{title}</title> : null}
      <defs>
        <linearGradient id={shellGradientId} x1="10" y1="8" x2="56" y2="56">
          <stop offset="0%" stopColor="#21d4fd" />
          <stop offset="58%" stopColor="#57f7b6" />
          <stop offset="100%" stopColor="#d7ff63" />
        </linearGradient>
        <linearGradient id={glyphGradientId} x1="22" y1="16" x2="42" y2="46">
          <stop offset="0%" stopColor="#6be8ff" />
          <stop offset="65%" stopColor="#73f4bd" />
          <stop offset="100%" stopColor="#d7ff63" />
        </linearGradient>
      </defs>

      <rect x="4" y="4" width="56" height="56" rx="18" fill="#07111f" />
      <rect
        x="4"
        y="4"
        width="56"
        height="56"
        rx="18"
        fill={`url(#${shellGradientId})`}
        opacity="0.18"
      />
      <rect
        x="4.75"
        y="4.75"
        width="54.5"
        height="54.5"
        rx="17.25"
        stroke="#8fecff"
        strokeOpacity="0.34"
        strokeWidth="1.5"
      />
      <path d="M19 16H25V20.5H22.75V43.5H25V48H19V16Z" fill="#eaf8ff" />
      <path d="M45 16H39V20.5H41.25V43.5H39V48H45V16Z" fill="#eaf8ff" />

      <path
        d="M28.5 17.5C26.3 20.2 26.7 23.2 29.2 25.2"
        stroke={`url(#${glyphGradientId})`}
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <path
        d="M32 15.5C29.8 18.6 30.3 22.3 32.9 24.8"
        stroke={`url(#${glyphGradientId})`}
        strokeWidth="2.8"
        strokeLinecap="round"
      />
      <path
        d="M35.5 17.5C33.3 20.2 33.7 23.2 36.2 25.2"
        stroke={`url(#${glyphGradientId})`}
        strokeWidth="2.6"
        strokeLinecap="round"
      />

      <circle cx="28.5" cy="32.5" r="1.7" fill="#72e7ff" />
      <circle cx="32" cy="35.7" r="1.95" fill="#9ef57e" />
      <circle cx="35.5" cy="39" r="1.7" fill="#eaf8ff" />

      <path
        d="M23.5 43.5C27.8 47.3 36.2 47.3 40.5 43.5"
        stroke={`url(#${glyphGradientId})`}
        strokeWidth="3.2"
        strokeLinecap="round"
      />
    </svg>
  );
}
