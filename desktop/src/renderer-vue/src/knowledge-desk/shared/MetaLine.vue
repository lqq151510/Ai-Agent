<script setup lang="ts">
import { computed } from 'vue'
import type { KnowledgeItem } from '../knowledgeDeskApi'
import { typeCopy } from '../knowledgeDeskViewModel'

const props = defineProps<{ item: KnowledgeItem }>()

const tags = computed(() => props.item.tags.slice(0, 3))
</script>

<template>
  <div class="kd-meta-line">
    <span>{{ typeCopy[item.type] }}</span>
    <span>{{ item.source }}</span>
    <span>{{ item.time }}</span>
    <span v-for="tag in tags" :key="tag">#{{ tag }}</span>
  </div>
</template>
