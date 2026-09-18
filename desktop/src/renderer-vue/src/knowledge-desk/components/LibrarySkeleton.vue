<script setup lang="ts">
import { Skeleton } from '../../components/ui'
import SkeletonCard from './SkeletonCard.vue'
</script>

<template>
  <div class="kd-library-layout">
    <SkeletonCard class="h-fit" />
    <div class="kd-stack">
      <div class="kd-page-tools">
        <Skeleton class="h-9 w-48 rounded-lg" />
        <Skeleton class="h-9 w-28 rounded-lg" />
      </div>
      <div class="kd-library-list">
        <SkeletonCard v-for="i in 5" :key="i" />
      </div>
    </div>
  </div>
</template>
