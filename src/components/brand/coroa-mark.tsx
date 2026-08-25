export function CoroaMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      role="img"
      aria-label="CoroaPDF"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="32" height="32" rx="8" fill="#08783f" />
      <path
        d="M22.8 13.5a8.2 8.2 0 1 0 .1 10.8"
        fill="none"
        stroke="#fff"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M9.5 10V6.5l4 2.2L16 4l2.5 4.7 4-2.2V10h-13Z"
        fill="none"
        stroke="#fff"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="m16 7.2 1.2 1.2-1.2 1.2-1.2-1.2L16 7.2Z" fill="#e52535" />
    </svg>
  );
}
