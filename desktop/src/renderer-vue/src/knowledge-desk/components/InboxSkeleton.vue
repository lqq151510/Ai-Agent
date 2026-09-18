<script setup lang="ts">
import { Skeleton } from '../../components/ui'
import SkeletonCard from './SkeletonCard.vue'
import SkeletonText from './SkeletonText.vue'
</script>

<template>
  <div class="kd-stack">
    <div class="kd-page-tools">
      <Skeleton class="h-9 w-64 rounded-lg" />
      <Skeleton class="h-9 w-28 rounded-lg" />
    </div>
    <div class="kd-inbox-board">
      <SkeletonCard
        v-for="i in 4"
        :key="i"
        class="grid grid-cols-[42px_1fr_auto] items-start gap-3"
      >
        <Skeleton class="h-10 w-10 rounded-lg" />
        <div class="flex flex-col gap-2">
          <Skeleton class="h-5 w-1/3" />
          <SkeletonText :lines="2" />
        </div>
        <Skeleton class="h-9 w-20 rounded-full" />
      </SkeletonCard>
    </div>
  </div>
</template>
