export function AdySymbol({ size = 52 }: { size?: number }) {
    return (
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none" role="img" aria-label="ady" className="shrink-0">
        <g stroke="currentColor" strokeWidth="4.2" strokeLinecap="round" className="text-admin-petrol">
          <path d="M6.6 28 15.9 10.4" />
          <path d="M25.4 28 16.1 10.4" />
          <path d="M11.4 21.6h9.2" strokeWidth="3.3" />
        </g>
        <circle cx="16" cy="3.9" r="2" className="fill-accent" />
      </svg>
    );
  }