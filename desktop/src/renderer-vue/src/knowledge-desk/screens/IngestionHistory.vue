<script lang="ts">
import type { KnowledgeIngestionJob } from '../knowledgeDeskApi'

export interface IngestionHistoryProps {
  error?: string | null
  isLoading: boolean
  jobs: KnowledgeIngestionJob[]
  onRetry: () => void
}

const ingestionJobTypeCopy: Record<KnowledgeIngestionJob['jobType'], string> = {
  import: '导入资料',
  organize: '整理资料',
  reprocess: '重新整理',
  unknown: '未知操作',
}

const ingestionJobStatusCopy: Record<KnowledgeIngestionJob['status'], string> = {
  pending: '等待处理',
  running: '处理中',
  succeeded: '已完成',
  failed: '处理失败',
  unknown: '未知状态',
}
</script>

<script setup lang="ts">
import { AlertTriangle, CheckCircle2, Clock3, Loader2 } from '@lucide/vue'
import { ErrorCard } from '../components'

withDefaults(defineProps<IngestionHistoryProps>(), { error: null })

function jobIcon(status: KnowledgeIngestionJob['status']) {
  if (status === 'succeeded') return CheckCircle2
  if (status === 'failed') return AlertTriangle
  if (status === 'running') return Loader2
  return Clock3
}

function formatIngestionJobTime(job: KnowledgeIngestionJob) {
  const value = job.finishedAt || job.startedAt || job.createdAt
  if (!value || Number.isNaN(Date.parse(value))) return '未记录处理时间'
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
}
</script>

<template>
  <section aria-labelledby="kd-ingestion-history-title" class="kd-ingestion-history">
    <div class="kd-ingestion-history__header">
      <div>
        <h3 id="kd-ingestion-history-title">处理记录</h3>
        <p>仅显示这条资料在本机的导入、整理与重试结果。</p>
      </div>
      <span v-if="isLoading" class="kd-ingestion-history__loading">
        <Loader2 :size="14" class="animate-spin" /> 同步中
      </span>
    </div>

    <ErrorCard
      v-if="error"
      class="kd-ingestion-history__error"
      description="处理记录暂时无法读取，正文与现有操作不受影响。"
      :error="error"
      :on-retry="onRetry"
      retry-label="重新读取"
      title="处理记录加载失败"
    />

    <p v-if="isLoading && jobs.length === 0" class="kd-ingestion-history__empty">
      <Loader2 :size="15" class="animate-spin" /> 正在读取这条资料的处理记录…
    </p>
    <p v-if="!isLoading && !error && jobs.length === 0" class="kd-ingestion-history__empty">
      暂无处理记录；早期导入的资料可能没有历史任务。
    </p>
    <ol v-if="jobs.length > 0" class="kd-ingestion-history__list">
      <li
        v-for="job in jobs"
        :key="job.id"
        :class="`kd-ingestion-history__item kd-ingestion-history__item--${job.status}`"
      >
        <component
          :is="jobIcon(job.status)"
          :class="job.status === 'running' ? 'animate-spin' : undefined"
          :size="17"
        />
        <div>
          <div class="kd-ingestion-history__title">
            <strong>{{ ingestionJobTypeCopy[job.jobType] }}</strong>
            <span>{{ ingestionJobStatusCopy[job.status] }}</span>
          </div>
          <p>{{ formatIngestionJobTime(job) }}</p>
          <p v-if="job.errorMessage" class="kd-ingestion-history__failure">失败原因：{{ job.errorMessage }}</p>
        </div>
      </li>
    </ol>
  </section>
</template>
