<script setup lang="ts">
import { computed } from 'vue'
import { FolderOpen } from '@lucide/vue'
import { activeFilterCount, type ItemFilters } from '../knowledgeDeskViewModel'
import { formatCount } from '../knowledgeDeskDisplay'

const props = defineProps<{
  filters: ItemFilters
  resultCount: number
  totalCount: number
  onClear: () => void
}>()

const activeCount = computed(() => activeFilterCount(props.filters))
</script>

<template>
  <div class="kd-filter-summary">
    <FolderOpen :size="18" />
    <strong>{{ activeCount > 0 ? `${activeCount} 个筛选条件` : '未启用筛选' }}</strong>
    <span>{{ formatCount(resultCount) }} / {{ formatCount(totalCount) }} 条结果可见</span>
    <button type="button" :disabled="activeCount === 0" @click="onClear()">清空筛选</button>
  </div>
</template>
