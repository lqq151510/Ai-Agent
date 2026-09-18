<script setup lang="ts" generic="T">
import { computed, ref, type ComponentPublicInstance } from 'vue'
import { useVirtualizer } from '@tanstack/vue-virtual'

// Multi-root component (empty slot vs list): bind $attrs explicitly so a caller
// supplied class reaches the scroll container.
defineOptions({ inheritAttrs: false })

const props = withDefaults(
  defineProps<{
    items: T[]
    estimateSize?: number
    overscan?: number
  }>(),
  {
    estimateSize: 120,
    overscan: 5,
  },
)

const parentRef = ref<HTMLDivElement | null>(null)

// Pass the whole options object as a computed ref: @tanstack/vue-virtual accepts
// MaybeRef<options> and re-applies it when the dependency (items.length) changes.
const virtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>(
  computed(() => ({
    count: props.items.length,
    getScrollElement: () => parentRef.value,
    estimateSize: () => props.estimateSize,
    overscan: props.overscan,
  })),
)

const virtualItems = computed(() => virtualizer.value.getVirtualItems())
const totalSize = computed(() => virtualizer.value.getTotalSize())

function measureItem(el: Element | ComponentPublicInstance | null) {
  virtualizer.value.measureElement((el ?? null) as HTMLDivElement | null)
}
</script>

<template>
  <slot v-if="items.length === 0" name="empty" />
  <div v-else ref="parentRef" v-bind="$attrs" class="kd-virtual-list">
    <div :style="{ height: `${totalSize}px`, position: 'relative' }">
      <div
        v-for="virtualItem in virtualItems"
        :key="String(virtualItem.key)"
        :ref="measureItem"
        :data-index="virtualItem.index"
        :style="{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          transform: `translateY(${virtualItem.start}px)`,
        }"
      >
        <slot :item="items[virtualItem.index]" :index="virtualItem.index" />
      </div>
    </div>
  </div>
</template>
