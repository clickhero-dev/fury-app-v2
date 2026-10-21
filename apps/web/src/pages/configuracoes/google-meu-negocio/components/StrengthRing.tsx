interface StrengthRingProps {
  percent: number;
  size?: number;
}

/** Anel "Força do perfil": vermelho parcial, verde completo. */
export function StrengthRing({ percent, size = 44 }: StrengthRingProps) {
  const clamped = Math.max(0, Math.min(100, percent));
  const stroke = 6;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const complete = clamped >= 100;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`Força do perfil: ${clamped}%`}
      data-complete={complete}
    >
      <circle className="gmb-ring-track" cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} />
      <circle
        className={complete ? 'gmb-ring-complete' : 'gmb-ring-partial'}
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - clamped / 100)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}
