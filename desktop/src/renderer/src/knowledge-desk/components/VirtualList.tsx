import { useRef, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { ReactNode } from 'react';

const VIRTUALIZATION_THRESHOLD = 50;

export interface VirtualListProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  estimateSize?: number;
  className?: string;
  emptyContent?: ReactNode;
  overscan?: number;
}

export function VirtualList<T>({
  items,
  renderItem,
  estimateSize = 120,
  className,
  emptyContent,
  overscan = 5,
}: VirtualListProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan,
  });

  const virtualItems = virtualizer.getVirtualItems();

  if (items.length === 0) {
    return <>{emptyContent}</>;
  }

  return (
    <div ref={parentRef} className={`kd-virtual-list ${className ?? ''}`}>
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
        {virtualItems.map((virtualItem) => (
          <div
            key={virtualItem.key}
            ref={virtualizer.measureElement}
            data-index={virtualItem.index}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualItem.start}px)`,
            }}
          >
            {renderItem(items[virtualItem.index], virtualItem.index)}
          </div>
        ))}
      </div>
    </div>
  );
}

export function useShouldVirtualize(count: number, threshold = VIRTUALIZATION_THRESHOLD) {
  return useMemo(() => count > threshold, [count, threshold]);
}
