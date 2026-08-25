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
        d="M22.1 14a8 8 0 1 0 0 10"
        fill="none"
        stroke="#fff"
        strokeWidth="3.8"
        strokeLinecap="round"
      />
      <path
        d="M10.8 9.3V6.2l3.2 2L16 4.2l2 4 3.2-2v3.1"
        fill="none"
        stroke="#fff"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M12 10.4h8" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" />
      <path d="m16 7.3 1 1-1 1-1-1 1-1Z" fill="#e52535" />
    </svg>
  );
}
