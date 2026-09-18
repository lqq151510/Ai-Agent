<script setup lang="ts">
import type { KnowledgeItem } from '../knowledgeDeskApi'
import { sourceIcon } from '../knowledgeDeskDisplay'

defineProps<{
  items: KnowledgeItem[]
  emptyText?: string
  onOpenDetail?: (item: KnowledgeItem) => void
}>()
</script>

<template>
  <div class="kd-item-list">
    <button
      v-for="item in items"
      :key="item.id"
      class="kd-compact-item"
      type="button"
      @click="onOpenDetail?.(item)"
    >
      <span class="kd-source-icon">
        <component :is="sourceIcon(item.type)" :size="18" />
      </span>
      <span>
        <strong>{{ item.title }}</strong>
        <small>{{ item.summary }}</small>
      </span>
    </button>
    <span v-if="items.length === 0 && emptyText" class="kd-empty-inline">{{ emptyText }}</span>
  </div>
</template>
