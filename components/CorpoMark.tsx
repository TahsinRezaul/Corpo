export default function CorpoMark({ size = 32, isDark = true }: { size?: number; isDark?: boolean }) {
  const legColor = isDark ? "rgba(210,222,245,0.82)" : "#061A35";
  return (
    <svg width={size} height={size} viewBox="290 170 440 440" fill="none" aria-label="CORPO">
      <defs>
        <linearGradient id="corpo-blue-arc" x1="332" y1="250" x2="704" y2="604" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#3B48FF"/>
          <stop offset="1" stopColor="#2738F4"/>
        </linearGradient>
        <linearGradient id="corpo-teal-ring" x1="444" y1="332" x2="589" y2="488" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#16C8BC"/>
          <stop offset="1" stopColor="#00A99D"/>
        </linearGradient>
      </defs>
      <path d="M 684 353 A 178 178 0 1 0 512 580" stroke="url(#corpo-blue-arc)" strokeWidth="58" strokeLinecap="round"/>
      <line x1="512" y1="458" x2="512" y2="580" stroke={legColor} strokeWidth="42" strokeLinecap="round"/>
      <line x1="559" y1="458" x2="666" y2="580" stroke={legColor} strokeWidth="42" strokeLinecap="round"/>
      <circle cx="512" cy="395" r="67" stroke="url(#corpo-teal-ring)" strokeWidth="55" fill="none"/>
    </svg>
  );
}
