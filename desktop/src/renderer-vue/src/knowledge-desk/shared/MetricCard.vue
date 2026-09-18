<script setup lang="ts">
import type { Component } from 'vue'

defineProps<{
  label: string
  value: string
  detail: string
  icon?: Component
}>()
</script>

<template>
  <article class="kd-metric">
    <div class="kd-metric-head">
      <span>{{ label }}</span>
      <component :is="icon" v-if="icon" class="kd-metric-icon" :size="16" />
    </div>
    <strong>{{ value }}</strong>
    <p>{{ detail }}</p>
  </article>
</template>
