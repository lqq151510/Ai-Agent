<script lang="ts">
export interface FileDropZoneProps {
  accept?: string
  description?: string
  disabled?: boolean
  file?: File | null
  onFileSelect: (file: File) => void
  title?: string
}
</script>

<script setup lang="ts">
import { ref } from 'vue'
import { FolderOpen, Upload } from '@lucide/vue'
import { KNOWLEDGE_FILE_ACCEPT, KNOWLEDGE_FILE_DESCRIPTION } from '../knowledgeDeskFileTypes'

const props = withDefaults(defineProps<FileDropZoneProps>(), {
  accept: KNOWLEDGE_FILE_ACCEPT,
  description: KNOWLEDGE_FILE_DESCRIPTION,
  disabled: false,
  title: '拖拽文件到此处，或点击选择文件',
})

const isDragging = ref(false)
const inputRef = ref<HTMLInputElement | null>(null)

function handleDragOver(event: DragEvent) {
  if (props.disabled) return
  event.preventDefault()
  isDragging.value = true
}

function handleDragLeave() {
  isDragging.value = false
}

function handleDrop(event: DragEvent) {
  if (props.disabled) return
  event.preventDefault()
  isDragging.value = false
  const droppedFile = event.dataTransfer?.files?.[0]
  if (droppedFile) {
    props.onFileSelect(droppedFile)
  }
}

function handleInputChange(event: Event) {
  const target = event.currentTarget as HTMLInputElement
  const selectedFile = target.files?.[0]
  if (selectedFile) {
    props.onFileSelect(selectedFile)
  }
  target.value = ''
}

function openPicker() {
  if (!props.disabled) inputRef.value?.click()
}
</script>

<template>
  <div
    :class="[
      'relative cursor-pointer rounded-xl border-2 border-dashed p-6 transition-colors',
      isDragging
        ? 'border-[var(--accent)] bg-[var(--accent-alpha-10)]'
        : 'border-[var(--border-default)] bg-[linear-gradient(135deg,var(--accent-alpha-8),var(--accent-alpha-5))]',
      disabled ? 'cursor-default opacity-60' : '',
    ]"
    @click="openPicker"
    @dragleave="handleDragLeave"
    @dragover="handleDragOver"
    @drop="handleDrop"
  >
    <input
      ref="inputRef"
      type="file"
      :accept="accept"
      class="kd-hidden-file-input absolute inset-0 hidden"
      @change="handleInputChange"
    />
    <div class="flex flex-col items-center gap-3 text-center">
      <div
        class="grid h-12 w-12 place-items-center rounded-full bg-[var(--accent-alpha-10)] text-[var(--accent)]"
      >
        <FolderOpen v-if="file" :size="24" />
        <Upload v-else :size="24" />
      </div>
      <div>
        <strong
          class="block font-[family-name:var(--font-sans)] text-lg text-[var(--text-primary)]"
        >
          {{ file ? file.name : title }}
        </strong>
        <span class="mt-1 block text-sm leading-relaxed text-[var(--text-secondary)]">
          {{ file ? `大小 ${(file.size / 1024).toFixed(1)} KB` : description }}
        </span>
      </div>
    </div>
  </div>
</template>
