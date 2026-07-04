import type { ReactNode } from 'react';
import { Skeleton } from '../../components/ui';

export const SkeletonText = ({ lines = 3, className = '' }: { lines?: number; className?: string }) => (
  <Skeleton className={className} variant="text" lines={lines} />
);

export const SkeletonCard = ({ children, className = '' }: { children?: ReactNode; className?: string }) => (
  <div className={`rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)] p-4 shadow-sm ${className}`}>
    {children ?? (
      <>
        <Skeleton className="mb-4 h-5 w-1/3" />
        <SkeletonText lines={4} />
      </>
    )}
  </div>
);

export const DashboardSkeleton = () => (
  <div className="kd-stack">
    <div className="kd-search-hero">
      <div className="w-full max-w-xl">
        <Skeleton className="mb-3 h-4 w-24" />
        <Skeleton className="h-8 w-3/4" />
      </div>
      <Skeleton className="h-10 w-28 shrink-0 rounded-lg" />
    </div>
    <div className="kd-stat-grid">
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
    </div>
    <div className="kd-two-column">
      <SkeletonCard />
      <SkeletonCard />
    </div>
  </div>
);

export const InboxSkeleton = () => (
  <div className="kd-stack">
    <div className="kd-page-tools">
      <Skeleton className="h-9 w-64 rounded-lg" />
      <Skeleton className="h-9 w-28 rounded-lg" />
    </div>
    <div className="kd-inbox-board">
      {Array.from({ length: 4 }).map((_, index) => (
        <SkeletonCard key={index} className="grid grid-cols-[42px_1fr_auto] items-start gap-3">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-5 w-1/3" />
            <SkeletonText lines={2} />
          </div>
          <Skeleton className="h-9 w-20 rounded-full" />
        </SkeletonCard>
      ))}
    </div>
  </div>
);

export const LibrarySkeleton = () => (
  <div className="kd-library-layout">
    <SkeletonCard className="h-fit" />
    <div className="kd-stack">
      <div className="kd-page-tools">
        <Skeleton className="h-9 w-48 rounded-lg" />
        <Skeleton className="h-9 w-28 rounded-lg" />
      </div>
      <div className="kd-library-list">
        {Array.from({ length: 5 }).map((_, index) => (
          <SkeletonCard key={index} />
        ))}
      </div>
    </div>
  </div>
);

export const ArchiveSkeleton = () => (
  <div className="kd-library-layout">
    <SkeletonCard className="h-fit" />
    <div className="kd-stack">
      <div className="kd-page-tools">
        <Skeleton className="h-9 w-48 rounded-lg" />
      </div>
      <div className="kd-library-list">
        {Array.from({ length: 5 }).map((_, index) => (
          <SkeletonCard key={index} />
        ))}
      </div>
    </div>
  </div>
);

export const DetailSkeleton = () => (
  <article className="kd-detail">
    <Skeleton className="mb-4 h-4 w-32" />
    <Skeleton className="mb-4 h-10 w-2/3" />
    <div className="mb-6 flex flex-wrap gap-3">
      <Skeleton className="h-6 w-24 rounded-full" />
      <Skeleton className="h-6 w-28 rounded-full" />
      <Skeleton className="h-6 w-20 rounded-full" />
    </div>
    <SkeletonText lines={8} />
  </article>
);
