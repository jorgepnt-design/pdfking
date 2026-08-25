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
        d="M23.2 10.8a10 10 0 1 0 .1 14"
        fill="none"
        stroke="#fff"
        strokeWidth="4.2"
        strokeLinecap="round"
      />
      <path
        d="M8.6 11.5V8.2l4 2.1L16 5.4l3.4 4.9 4-2.1v3.3"
        fill="none"
        stroke="#fff"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M22.9 24.9c1.4-.5 2.6-1.4 3.5-2.5"
        fill="none"
        stroke="#e52535"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
    </svg>
  );
}
