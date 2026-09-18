<script lang="ts">
import type { Component } from 'vue'

export interface PanelProps {
  title: string
  icon: Component
}
</script>

<script setup lang="ts">
defineProps<PanelProps>()
</script>

<template>
  <section class="kd-panel">
    <header>
      <component :is="icon" :size="17" />
      <h2>{{ title }}</h2>
    </header>
    <slot />
  </section>
</template>
