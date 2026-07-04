import { useMemo } from 'react';

const VIRTUALIZATION_THRESHOLD = 50;

export function useShouldVirtualize(count: number, threshold = VIRTUALIZATION_THRESHOLD) {
  return useMemo(() => count > threshold, [count, threshold]);
}
