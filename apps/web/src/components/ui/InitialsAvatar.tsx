const PALETTE = [
  '#1B3A6B', '#0F7B6C', '#E8701A', '#6C3483',
  '#1E8449', '#C0392B', '#2E86C1', '#7D6608',
];

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return hash;
}

interface InitialsAvatarProps {
  name: string;
  size?: number;
  className?: string;
}

export default function InitialsAvatar({ name, size = 40, className }: InitialsAvatarProps) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const initials =
    words.length >= 2
      ? `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase()
      : (words[0]?.[0] ?? '?').toUpperCase();

  const bg = PALETTE[hashName(name) % PALETTE.length];
  const fontSize = size / 2.5;

  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: bg,
        color: '#fff',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize,
        fontWeight: 600,
        flexShrink: 0,
        userSelect: 'none',
      }}
      aria-label={`${name} avatar`}
    >
      {initials}
    </div>
  );
}
