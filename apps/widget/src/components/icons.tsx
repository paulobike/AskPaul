/** Stroke icons, inlined so the widget makes no extra requests. Decorative: hidden from screen readers. */
const base = { fill: 'none', stroke: 'currentColor', 'stroke-width': 1.9, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' } as const;

export const Spark = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
    <path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" />
  </svg>
);
export const Close = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" {...base}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
export const Arrow = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base} stroke-width="2.2">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
export const ArrowOut = ({ size = 13 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base} stroke-width="2.3">
    <path d="M7 17L17 7M9 7h8v8" />
  </svg>
);
export const Check = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base} stroke-width="2.6">
    <path d="M5 12l5 5 9-10" />
  </svg>
);
export const Chevron = ({ up = false }: { up?: boolean }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" {...base} stroke-width="2">
    <path d={up ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} />
  </svg>
);
export const Doc = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
    <rect x="5" y="3" width="14" height="18" rx="2.5" />
    <path d="M9 8h6M9 12h6M9 16h4" />
  </svg>
);
export const Copy = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V5a2 2 0 0 1 2-2h8" />
  </svg>
);
export const Download = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base} stroke-width="2.1">
    <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
  </svg>
);
export const Mail = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
    <rect x="3" y="5" width="18" height="14" rx="2.5" />
    <path d="M4 7l8 6 8-6" />
  </svg>
);
export const Calendar = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
    <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </svg>
);
export const Stop = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
    <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
  </svg>
);
export const Clock = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);
export const WifiOff = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
    <path d="M2 8.5a15 15 0 0 1 20 0M5.5 12a10 10 0 0 1 13 0M9 15.5a5 5 0 0 1 6 0M3 3l18 18" />
  </svg>
);
export const Code = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
    <path d="M8 7l-5 5 5 5M16 7l5 5-5 5" />
  </svg>
);
export const Reset = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
    <path d="M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4" />
  </svg>
);
