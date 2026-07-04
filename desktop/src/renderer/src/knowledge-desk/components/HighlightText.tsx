interface HighlightTextProps {
  text: string;
  query: string;
  className?: string;
}

export const HighlightText = ({ text, query, className = '' }: HighlightTextProps) => {
  if (!query.trim()) {
    return <span className={className}>{text}</span>;
  }

  const tokens = query
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0)
    .map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

  if (tokens.length === 0) {
    return <span className={className}>{text}</span>;
  }

  const pattern = new RegExp(`(${tokens.join('|')})`, 'gi');
  const parts = text.split(pattern);

  return (
    <span className={className}>
      {parts.map((part, index) => {
        const isMatch = tokens.some((token) => part.toLowerCase() === token.toLowerCase());
        return isMatch ? (
          <mark className="rounded-sm bg-[var(--warning-alpha-15)] px-0.5 text-[var(--accent)]" key={index}>
            {part}
          </mark>
        ) : (
          <span key={index}>{part}</span>
        );
      })}
    </span>
  );
};
