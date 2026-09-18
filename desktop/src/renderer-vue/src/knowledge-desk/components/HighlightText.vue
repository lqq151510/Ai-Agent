<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  text: string
  query: string
}>()

interface Part {
  text: string
  isMatch: boolean
}

const parts = computed<Part[]>(() => {
  const single: Part[] = [{ text: props.text, isMatch: false }]

  if (!props.query.trim()) return single

  const tokens = props.query
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0)
    .map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))

  if (tokens.length === 0) return single

  const pattern = new RegExp(`(${tokens.join('|')})`, 'gi')
  return props.text.split(pattern).map((part) => ({
    text: part,
    isMatch: tokens.some((token) => part.toLowerCase() === token.toLowerCase()),
  }))
})
</script>

<template>
  <span>
    <template v-for="(part, index) in parts" :key="index">
      <mark
        v-if="part.isMatch"
        class="rounded-sm bg-[var(--warning-alpha-15)] px-0.5 text-[var(--accent)]"
        >{{ part.text }}</mark
      >
      <span v-else>{{ part.text }}</span>
    </template>
  </span>
</template>
