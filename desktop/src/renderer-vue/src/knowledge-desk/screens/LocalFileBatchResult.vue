<script lang="ts">
import type { LocalFileBatchCommitResult } from '../knowledgeDeskApi'

export interface LocalFileBatchResultProps {
  result: LocalFileBatchCommitResult
}
</script>

<script setup lang="ts">
import { CheckCircle2 } from '@lucide/vue'

withDefaults(defineProps<LocalFileBatchResultProps>(), {})
</script>

<template>
  <section class="kd-batch-result" aria-label="本机文件导入结果">
    <header>
      <CheckCircle2 :size="18" />
      <div>
        <strong>本次导入结果</strong>
        <span>成功 {{ result.imported.length }} 个，跳过 {{ result.skipped.length }} 个，失败 {{ result.failed.length }} 个</span>
      </div>
    </header>
    <ul v-if="result.skipped.length > 0 || result.failed.length > 0">
      <li v-for="entry in result.skipped" :key="`skipped-${entry.candidateId}`">
        <span>{{ entry.name }}</span>
        <small>已跳过：{{ entry.reason }}</small>
      </li>
      <li
        v-for="entry in result.failed"
        :key="`failed-${entry.candidateId}`"
        class="kd-batch-result-failed"
      >
        <span>{{ entry.name }}</span>
        <small>失败：{{ entry.reason }}</small>
      </li>
    </ul>
  </section>
</template>
