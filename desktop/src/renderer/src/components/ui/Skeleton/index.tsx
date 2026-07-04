import React from 'react';

export type SkeletonVariant = 'circle' | 'rect' | 'text';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: SkeletonVariant;
  width?: number | string;
  height?: number | string;
  lines?: number;
}

export default function Skeleton({
  variant = 'rect',
  width,
  height,
  lines = 1,
  className = '',
  style,
  ...props
}: SkeletonProps) {
  const base =
    'bg-[var(--surface-hover)] animate-pulse';

  const dimensionStyle: React.CSSProperties = {
    width: width ?? (variant === 'text' ? '100%' : undefined),
    height: height ?? (variant === 'text' ? 12 : undefined),
    borderRadius:
      variant === 'circle'
        ? '50%'
        : variant === 'text'
        ? 'var(--radius-sm)'
        : 'var(--radius-md)',
    ...style,
  };

  if (variant === 'text' && lines > 1) {
    return (
      <div className={['flex flex-col gap-2', className].join(' ')} {...props}>
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={base}
            style={{
              ...dimensionStyle,
              width:
                width ??
                (i === lines - 1 ? '75%' : '100%'),
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={[base, className].filter(Boolean).join(' ')}
      style={dimensionStyle}
      {...props}
    />
  );
}
