<script lang="ts">
export interface SkeletonTextProps {
  lines?: number
}
</script>

<script setup lang="ts">
import { Skeleton } from '../../components/ui'

withDefaults(defineProps<SkeletonTextProps>(), {
  lines: 3,
})
</script>

<template>
  <Skeleton variant="text" :lines="lines" />
</template>
