<script setup lang="ts">
import type { KnowledgeItem } from '../knowledgeDeskApi'

defineOptions({ inheritAttrs: false })

defineProps<{ item: KnowledgeItem }>()
</script>

<template>
  <span>{{ item.time }}</span>
  <strong>{{ item.title }}</strong>
</template>
