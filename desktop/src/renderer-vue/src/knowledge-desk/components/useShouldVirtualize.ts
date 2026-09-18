import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from 'vue'

const VIRTUALIZATION_THRESHOLD = 50

/**
 * Vue port of the React hook: accepts a ref, getter, or plain number so callers
 * can pass reactive list lengths directly.
 */
export function useShouldVirtualize(
  count: MaybeRefOrGetter<number>,
  threshold = VIRTUALIZATION_THRESHOLD,
): ComputedRef<boolean> {
  return computed(() => toValue(count) > threshold)
}

export default useShouldVirtualize
