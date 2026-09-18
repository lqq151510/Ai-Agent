<script lang="ts">
import type { LocalFileBatchCandidate, LocalFileBatchCandidateVerdict } from '../knowledgeDeskApi'

export interface LocalFileBatchPreflightListProps {
  candidates: LocalFileBatchCandidate[]
  disabled: boolean
  onToggle: (candidateId: string, checked: boolean) => void
  selectedCandidateIds: string[]
}
</script>

<script setup lang="ts">
import { computed } from 'vue'
import { AlertTriangle } from '@lucide/vue'

const props = withDefaults(defineProps<LocalFileBatchPreflightListProps>(), {})

const localFileBatchVerdictCopy: Record<LocalFileBatchCandidateVerdict, string> = {
  ready: '可导入',
  duplicate_existing: '已入库',
  duplicate_in_batch: '批内重复',
  invalid: '不可导入',
}

const formatFileSize = (size: number) => {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.round(size / 102.4) / 10} KB`
  return `${Math.round(size / (1024 * 102.4)) / 10} MB`
}

const readyCount = computed(() => (
  props.candidates.filter((candidate) => candidate.verdict === 'ready').length
))
const skippedCount = computed(() => props.candidates.length - readyCount.value)
</script>

<template>
  <section class="kd-batch-preflight" aria-label="本机文件预检清单">
    <header>
      <div>
        <strong>预检清单</strong>
        <span>可导入 {{ readyCount }} 个，已跳过 {{ skippedCount }} 个</span>
      </div>
      <span>{{ candidates.length }} 个文件</span>
    </header>
    <ul>
      <li
        v-for="candidate in candidates"
        :key="candidate.candidateId"
        :class="['kd-batch-candidate', 'kd-batch-candidate-' + candidate.verdict]"
      >
        <template v-if="candidate.verdict === 'ready'">
          <input
            :aria-label="`选择 ${candidate.name}`"
            :checked="selectedCandidateIds.includes(candidate.candidateId)"
            :disabled="disabled"
            type="checkbox"
            @change="(event) => onToggle(candidate.candidateId, (event.target as HTMLInputElement).checked)"
          />
        </template>
        <template v-else>
          <AlertTriangle aria-hidden="true" :size="16" />
        </template>
        <div>
          <strong :title="candidate.name">{{ candidate.name }}</strong>
          <span>{{ formatFileSize(candidate.size) }} · {{ localFileBatchVerdictCopy[candidate.verdict] }}</span>
          <small v-if="candidate.reason">{{ candidate.reason }}</small>
        </div>
      </li>
    </ul>
  </section>
</template>
