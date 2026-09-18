<script setup lang="ts">
import type { Component } from 'vue'

defineProps<{
  title: string
  icon?: Component
}>()
</script>

<template>
  <section class="kd-context-block">
    <h2>
      <component :is="icon" v-if="icon" :size="15" />
      {{ title }}
    </h2>
    <slot />
  </section>
</template>
