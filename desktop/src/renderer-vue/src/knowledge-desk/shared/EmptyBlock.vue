<script setup lang="ts">
import type { Component } from 'vue'

defineProps<{
  title: string
  description: string
  icon: Component
  action?: { label: string; onClick: () => void }
}>()
</script>

<template>
  <div class="kd-empty-state">
    <component :is="icon" :size="18" />
    <strong>{{ title }}</strong>
    <span>{{ description }}</span>
    <button
      v-if="action"
      class="kd-action-button kd-action-button--primary"
      type="button"
      @click="action.onClick()"
    >
      {{ action.label }}
    </button>
  </div>
</template>
