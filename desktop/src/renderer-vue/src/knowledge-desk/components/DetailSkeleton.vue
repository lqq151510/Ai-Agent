<script setup lang="ts">
import { Skeleton } from '../../components/ui'
import SkeletonText from './SkeletonText.vue'
</script>

<template>
  <article class="kd-detail">
    <Skeleton class="mb-4 h-4 w-32" />
    <Skeleton class="mb-4 h-10 w-2/3" />
    <div class="mb-6 flex flex-wrap gap-3">
      <Skeleton class="h-6 w-24 rounded-full" />
      <Skeleton class="h-6 w-28 rounded-full" />
      <Skeleton class="h-6 w-20 rounded-full" />
    </div>
    <SkeletonText :lines="8" />
  </article>
</template>
