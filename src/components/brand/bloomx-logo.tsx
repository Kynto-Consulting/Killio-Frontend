import { useId } from "react";

/** The Bloomx flower mark (same drawing as public/brand/bloomx-flower.svg). */
export function BloomxLogo({ className }: { className?: string }) {
  const gradient = useId().replace(/:/g, "");
  return (
    <svg aria-hidden viewBox="0 0 64 64" className={className}>
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FF7AB6" />
          <stop offset="1" stopColor="#7C5CFF" />
        </linearGradient>
      </defs>
      <g transform="translate(32 32)" fill={`url(#${gradient})`} fillOpacity="0.92">
        {[0, 72, 144, 216, 288].map((angle) => (
          <path key={angle} transform={`rotate(${angle})`} d="M0 -5 C 10 -11 10 -27 0 -30 C -10 -27 -10 -11 0 -5 Z" />
        ))}
      </g>
      <circle cx="32" cy="32" r="6.5" fill="#FFE08A" />
      <circle cx="32" cy="32" r="2.6" fill="#FFB347" />
    </svg>
  );
}
