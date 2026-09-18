<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    title: string
    values: string[]
    activeValues: string[]
    onToggle: (value: string) => void
    selectionMode?: 'multiple' | 'single'
  }>(),
  {
    selectionMode: 'multiple',
  },
)

const inputType = computed(() => (props.selectionMode === 'single' ? 'radio' : 'checkbox'))
const groupName = computed(() =>
  props.selectionMode === 'single' ? `filter-${props.title}` : undefined,
)
</script>

<template>
  <section class="kd-filter-group">
    <h3>{{ title }}</h3>
    <label v-for="value in values" :key="value">
      <input
        :type="inputType"
        :name="groupName"
        :checked="activeValues.includes(value)"
        @change="onToggle(value)"
      />
      {{ value }}
    </label>
    <span v-if="values.length === 0" class="kd-muted">暂无可筛选项</span>
  </section>
</template>
