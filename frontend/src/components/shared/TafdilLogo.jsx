export default function TafdilLogo({ size = 48, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Gear body */}
      <path
        d="M32 20a12 12 0 1 0 0 24 12 12 0 0 0 0-24z"
        fill="#1a3a5c"
      />
      {/* Gear teeth */}
      <path
        d="M28 8h8v6l3.5 2 5-3.46 5.66 5.66L47 23.5l2 3.5h6v8h-6l-2 3.5 3.46 5-5.66 5.66-5-3.46L36 47.5v6h-8v-6l-3.5-2-5 3.46-5.66-5.66L17 37.5l-2-3.5H9v-8h6l2-3.5-3.46-5 5.66-5.66 5 3.46L28 14V8z"
        fill="#1a3a5c"
      />
      {/* Inner circle cutout */}
      <circle cx="32" cy="32" r="7" fill="white" />
      {/* Red swoosh arc */}
      <path
        d="M14 46 Q32 56 50 46"
        stroke="#e8740c"
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
