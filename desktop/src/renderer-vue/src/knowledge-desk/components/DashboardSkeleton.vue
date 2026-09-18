<script setup lang="ts">
import { Skeleton } from '../../components/ui'
import SkeletonCard from './SkeletonCard.vue'
</script>

<template>
  <div class="kd-stack">
    <div class="kd-search-hero">
      <div class="w-full max-w-xl">
        <Skeleton class="mb-3 h-4 w-24" />
        <Skeleton class="h-8 w-3/4" />
      </div>
      <Skeleton class="h-10 w-28 shrink-0 rounded-lg" />
    </div>
    <div class="kd-stat-grid">
      <SkeletonCard v-for="i in 4" :key="i" />
    </div>
    <div class="kd-two-column">
      <SkeletonCard />
      <SkeletonCard />
    </div>
  </div>
</template>
