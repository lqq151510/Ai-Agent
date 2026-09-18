<script setup lang="ts">
import { computed } from 'vue'
import type { KnowledgeItem } from '../knowledgeDeskApi'

const props = defineProps<{
  status: NonNullable<KnowledgeItem['status']>
}>()

const statusCopy: Record<NonNullable<KnowledgeItem['status']>, string> = {
  pending: '待整理',
  processing: '整理中',
  done: '已整理',
  failed: '需重试',
  archived: '已归档',
}

const label = computed(() => statusCopy[props.status])
</script>

<template>
  <span :class="`kd-status kd-status--${status}`">{{ label }}</span>
</template>
