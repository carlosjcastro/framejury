export function LogoMark({ size = 22 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="var(--accent)"
      strokeWidth="2.5"
      strokeLinecap="square"
    >
      <path d="M3 8V3h5M16 3h5v5M21 16v5h-5M8 21H3v-5" />
    </svg>
  );
}
