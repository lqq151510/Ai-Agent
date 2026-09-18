<script setup lang="ts">
import { Skeleton } from '../../components/ui'
import SkeletonText from './SkeletonText.vue'
</script>

<template>
  <div class="rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)] p-4 shadow-sm">
    <slot>
      <Skeleton class="mb-4 h-5 w-1/3" />
      <SkeletonText :lines="4" />
    </slot>
  </div>
</template>
