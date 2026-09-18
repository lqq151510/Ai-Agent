<script setup lang="ts">
defineProps<{
  label: string
  value: string
}>()
</script>

<template>
  <div class="kd-preference-row">
    <span>{{ label }}</span>
    <strong>{{ value }}</strong>
  </div>
</template>
