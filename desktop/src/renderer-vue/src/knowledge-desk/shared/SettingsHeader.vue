<script setup lang="ts">
defineProps<{
  title: string
  description: string
}>()
</script>

<template>
  <header class="kd-settings-header">
    <h2>{{ title }}</h2>
    <p>{{ description }}</p>
  </header>
</template>
