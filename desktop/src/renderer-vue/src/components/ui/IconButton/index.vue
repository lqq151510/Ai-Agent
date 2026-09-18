<script setup lang="ts">
import Button from '../Button/index.vue'
import type { ButtonSize } from '../Button/index.vue'

withDefaults(defineProps<{ size?: ButtonSize }>(), {
  size: 'md',
})
</script>

<template>
  <Button variant="icon" :size="size" class="min-w-[32px] min-h-[32px]">
    <slot />
  </Button>
</template>
