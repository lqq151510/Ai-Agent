<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    label: string
    checked: boolean
    disabled?: boolean
    onChange?: (checked: boolean) => void
  }>(),
  {
    disabled: false,
  },
)

function handleChange(event: Event) {
  const target = event.target as HTMLInputElement
  props.onChange?.(target.checked)
}
</script>

<template>
  <label class="kd-toggle-row">
    <span>{{ label }}</span>
    <input
      type="checkbox"
      :checked="checked"
      :disabled="disabled"
      :readonly="!onChange"
      @change="handleChange"
    />
  </label>
</template>
