<script lang="ts">
import type { Component } from 'vue'

export interface EmptyStateAction {
  label: string
  onClick: () => void
}

export interface EmptyStateProps {
  icon: Component
  title: string
  description: string
  action?: EmptyStateAction
}
</script>

<script setup lang="ts">
import { Button } from '../../components/ui'

defineProps<EmptyStateProps>()
</script>

<template>
  <div
    class="flex flex-col items-center justify-center gap-3 rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)] p-8 text-center shadow-sm"
  >
    <div
      class="grid h-12 w-12 place-items-center rounded-full bg-[var(--accent-alpha-10)] text-[var(--accent)]"
    >
      <component :is="icon" :size="24" />
    </div>
    <div class="flex flex-col gap-1">
      <strong class="text-base font-bold text-[var(--text-primary)]">{{ title }}</strong>
      <span class="max-w-sm text-sm leading-relaxed text-[var(--text-secondary)]">
        {{ description }}
      </span>
    </div>
    <Button v-if="action" class="mt-1" variant="primary" @click="action.onClick()">
      <slot name="action-icon" />
      {{ action.label }}
    </Button>
    <slot />
  </div>
</template>
