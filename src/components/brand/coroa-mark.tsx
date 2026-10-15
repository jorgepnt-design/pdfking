/** CoroaPDF-Logo: kräftiges C mit goldener Krone (wie das App-Icon, assets/app-icon.svg). */
export function CoroaMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1024 1024"
      role="img"
      aria-label="CoroaPDF"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="1024" height="1024" rx="256" fill="#0b8748" />
      <path
        d="M670 480A215 215 0 1 0 670 720"
        fill="none"
        stroke="#fff"
        strokeWidth="120"
        strokeLinecap="round"
      />
      <path
        d="M300 340 280 170 410 250 512 120 614 250 744 170 724 340Z"
        fill="#f7b928"
        stroke="#a86f00"
        strokeWidth="14"
        strokeLinejoin="round"
      />
      <rect
        x="300"
        y="330"
        width="424"
        height="40"
        rx="14"
        fill="#f7b928"
        stroke="#a86f00"
        strokeWidth="14"
      />
      <circle cx="512" cy="230" r="34" fill="#e52535" />
    </svg>
  );
}
