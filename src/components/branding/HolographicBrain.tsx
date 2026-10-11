/**
 * React wrapper around the canonical CampusIQ brand mark (also exported as
 * a static file at public/icons/icon.svg for favicon/PWA-icon use — keep
 * the two in sync if you edit the artwork). Inline here (rather than an
 * <img>) so its glow/particle colors can respond to CSS custom properties
 * at render time if a future theme system needs it.
 */
export function HolographicBrain({ size = 48, animated = true }: { size?: number; animated?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      role="img"
      aria-label="CampusIQ"
      style={{ display: "block" }}
    >
      <defs>
        <linearGradient id="brainStroke" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00E5FF" />
          <stop offset="55%" stopColor="#8B5CF6" />
          <stop offset="100%" stopColor="#D946EF" />
        </linearGradient>
        <filter id="softGlow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="6" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g
        stroke="url(#brainStroke)"
        strokeWidth="1.5"
        fill="none"
        opacity="0.35"
        style={animated ? { transformOrigin: "256px 256px", animation: "campusiq-orbit 18s linear infinite" } : undefined}
      >
        <ellipse cx="256" cy="256" rx="200" ry="88" transform="rotate(18 256 256)" />
        <ellipse cx="256" cy="256" rx="190" ry="150" transform="rotate(-24 256 256)" />
      </g>

      <g filter="url(#softGlow)" fill="none" stroke="url(#brainStroke)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M186 158 C142 158 108 190 104 230 C82 238 68 264 76 292 C64 308 66 336 84 352 C82 376 100 398 126 404 C136 424 158 436 182 434 C198 452 224 458 246 448" />
        <path d="M326 158 C370 158 404 190 408 230 C430 238 444 264 436 292 C448 308 446 336 428 352 C430 376 412 398 386 404 C376 424 354 436 330 434 C314 452 288 458 266 448" />
        <path d="M256 168 L256 442" strokeWidth="4" opacity="0.55" />
        <path d="M150 220 C176 208 196 224 190 248 C184 270 156 274 150 254" strokeWidth="4" opacity="0.85" />
        <path d="M118 288 C144 278 166 292 160 314" strokeWidth="4" opacity="0.85" />
        <path d="M140 360 C162 352 182 362 180 382" strokeWidth="4" opacity="0.85" />
        <path d="M362 220 C336 208 316 224 322 248 C328 270 356 274 362 254" strokeWidth="4" opacity="0.85" />
        <path d="M394 288 C368 278 346 292 352 314" strokeWidth="4" opacity="0.85" />
        <path d="M372 360 C350 352 330 362 332 382" strokeWidth="4" opacity="0.85" />
      </g>

      <g fill="#00E5FF">
        <circle cx="104" cy="230" r="4.5" filter="url(#softGlow)" />
        <circle cx="408" cy="230" r="4.5" filter="url(#softGlow)" />
        <circle cx="76" cy="292" r="3.5" fill="#8B5CF6" filter="url(#softGlow)" />
        <circle cx="436" cy="292" r="3.5" fill="#8B5CF6" filter="url(#softGlow)" />
        <circle cx="126" cy="404" r="4" fill="#D946EF" filter="url(#softGlow)" />
        <circle cx="386" cy="404" r="4" fill="#D946EF" filter="url(#softGlow)" />
      </g>

      {animated && (
        <style>{`
          @keyframes campusiq-orbit { to { transform: rotate(360deg); } }
          @media (prefers-reduced-motion: reduce) {
            [style*="campusiq-orbit"] { animation: none !important; }
          }
        `}</style>
      )}
    </svg>
  );
}
