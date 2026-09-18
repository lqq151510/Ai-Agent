<script lang="ts">
export interface CollectionPaginationProps {
  currentPage: number
  isLoading: boolean
  label: string
  onPageChange: (page: number) => void
  pageSize: number
  total: number
}
</script>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<CollectionPaginationProps>()

const totalPages = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)))
</script>

<template>
  <nav v-if="totalPages > 1" class="kd-search-pagination" :aria-label="label">
    <button
      type="button"
      :disabled="isLoading || currentPage <= 1"
      @click="onPageChange(currentPage - 1)"
    >
      上一页
    </button>
    <span>第 {{ currentPage }} / {{ totalPages }} 页</span>
    <button
      type="button"
      :disabled="isLoading || currentPage >= totalPages"
      @click="onPageChange(currentPage + 1)"
    >
      下一页
    </button>
  </nav>
</template>
