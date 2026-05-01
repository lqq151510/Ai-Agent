import React from 'react';

interface SkeletonProps {
  className?: string;
  count?: number;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className = '', count = 1 }) => {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={`skeleton ${className}`} />
      ))}
    </>
  );
};

export const SkeletonCard: React.FC = () => (
  <div className="skeleton-card">
    <Skeleton className="skeleton-title" />
    <Skeleton className="skeleton-text" count={2} />
  </div>
);

export const SkeletonMessage: React.FC = () => (
  <div className="skeleton-message">
    <div className="skeleton-avatar" />
    <div className="skeleton-content">
      <Skeleton className="skeleton-line" count={3} />
    </div>
  </div>
);
