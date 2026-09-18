<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { AlertTriangle, Archive, FileText, FolderOpen, MessageCircle, Pencil, Save, X } from '@lucide/vue'
import type { KnowledgeIngestionJob, KnowledgeItem } from '../knowledgeDeskApi'
import type { KnowledgeWorkflowAction } from '../knowledgeDeskViewModel'
import { buildWorkflowActions, typeCopy } from '../knowledgeDeskViewModel'
import { DetailSkeleton } from '../components'
import { sourceIcon } from '../knowledgeDeskDisplay'
import { StatusPill } from '../shared'
import IngestionHistory from './IngestionHistory.vue'

const props = defineProps<{
  actionState: { itemId: string; action: KnowledgeWorkflowAction } | null
  error?: string | null
  isLoading?: boolean
  item: KnowledgeItem
  jobHistoryEnabled: boolean
  jobs: KnowledgeIngestionJob[]
  jobsError?: string | null
  jobsLoading: boolean
  onAction: (item: KnowledgeItem, action: KnowledgeWorkflowAction) => Promise<void>
  onAskAssistant: (item: KnowledgeItem, context?: 'summary' | 'body') => void
  onOpenManagedSourceAsset: (assetId: string, reveal?: boolean) => Promise<void>
  onRetryJobs: () => void
  onUpdate: (item: KnowledgeItem, draft: { title: string; summary: string; tags: string[] }) => Promise<void>
}>()

const editing = ref(false)
const saving = ref(false)
const editError = ref<string | null>(null)
const title = ref('')
const summary = ref('')
const tags = ref('')
const visibleParagraphs = ref(8)
const body = computed(() => props.item.cleanedContent || props.item.rawContent || props.item.summary)
const paragraphs = computed(() => body.value.split('\n').map((line) => line.trim()).filter(Boolean))
const actions = computed(() => buildWorkflowActions(props.item))
const canAskBody = computed(() => Boolean((props.item.cleanedContent || props.item.rawContent || '').trim()))

function beginEdit() {
  title.value = props.item.title; summary.value = props.item.summary; tags.value = props.item.tags.join(', '); editError.value = null; editing.value = true
}
watch(() => props.item.id, () => { if (!editing.value) beginEdit(); editing.value = false })
async function submitEdit() {
  const nextTitle = title.value.trim(); const nextTags = Array.from(new Set(tags.value.split(',').map((tag) => tag.trim()).filter(Boolean)))
  if (!nextTitle) { editError.value = '标题不能为空。'; return }
  if (nextTitle.length > 240 || nextTags.length > 12 || nextTags.some((tag) => tag.length > 80)) { editError.value = '标题最多 240 个字符，最多 12 个标签且每个标签不超过 80 个字符。'; return }
  saving.value = true; editError.value = null
  try { await props.onUpdate(props.item, { title: nextTitle, summary: summary.value.trim(), tags: nextTags }); editing.value = false } catch (error) { editError.value = error instanceof Error ? error.message : String(error) } finally { saving.value = false }
}
async function openAsset(reveal = false) {
  if (props.item.sourceAsset?.availability !== 'available') return
  await props.onOpenManagedSourceAsset(props.item.sourceAsset.id, reveal)
}
</script>

<template>
  <DetailSkeleton v-if="isLoading" />
  <article v-else class="kd-detail">
    <div class="kd-detail-header"><div class="kd-detail-identity"><span class="kd-detail-index">RECORD / {{ item.id.slice(-4).toUpperCase() }}</span><div class="kd-breadcrumb">{{ item.status === 'archived' ? '归档库' : '知识库' }} / {{ item.tags[0] ?? '未分类' }} / {{ typeCopy[item.type] }}</div></div><div class="kd-inline-actions"><button v-for="action in actions" :key="action.id" :class="`kd-action-button kd-action-button--${action.tone}`" :disabled="actionState?.itemId === item.id && actionState.action === action.id" type="button" @click="void onAction(item, action.id)">{{ actionState?.itemId === item.id && actionState.action === action.id ? '处理中' : action.label }}</button><button class="kd-action-button" type="button" @click="onAskAssistant(item, 'summary')"><MessageCircle :size="15" /> 问本机助手</button><button v-if="canAskBody" class="kd-action-button" type="button" @click="onAskAssistant(item, 'body')"><FileText :size="15" /> 带正文提问</button><button class="kd-action-button" :disabled="editing" type="button" @click="beginEdit"><Pencil :size="15" /> 编辑</button></div></div>
    <form v-if="editing" class="kd-detail-editor" @submit.prevent="void submitEdit()"><label class="kd-field"><span>标题</span><input v-model="title" maxlength="240" /></label><label class="kd-field"><span>摘要</span><textarea v-model="summary" rows="4" /></label><label class="kd-field"><span>标签（使用逗号分隔）</span><input v-model="tags" /></label><p v-if="editError" class="kd-form-error">{{ editError }}</p><div class="kd-inline-actions"><button class="kd-action-button" :disabled="saving" type="button" @click="editing = false"><X :size="15" /> 取消</button><button class="kd-action-button kd-action-button--primary" :disabled="saving" type="submit"><Save :size="15" /> {{ saving ? '保存中' : '保存修改' }}</button></div></form><h2 v-else>{{ item.title }}</h2>
    <div class="kd-detail-meta"><span><component :is="sourceIcon(item.type)" :size="16" /> {{ typeCopy[item.type] }}</span><span>{{ item.time }} 整理</span><span>{{ item.source }}</span><StatusPill v-if="item.status" :status="item.status" /></div>
    <div v-if="item.status === 'failed'" class="kd-detail-status kd-detail-status--error"><AlertTriangle :size="16" /> 上次整理失败，可重新整理。</div><div v-if="item.status === 'archived'" class="kd-detail-status"><Archive :size="16" /> 这条资料已归档。</div><div v-if="item.sourceAsset" class="kd-source-asset"><FolderOpen :size="18" /><div><strong>{{ item.sourceAsset.originalFilename }}</strong><span>{{ item.sourceAsset.availability === 'available' ? '本机原件可用' : '本机原件不可用' }}</span></div><button v-if="item.sourceAsset.availability === 'available'" class="kd-action-button" type="button" @click="void openAsset()">打开原件</button><button v-if="item.sourceAsset.availability === 'available'" class="kd-action-button" type="button" @click="void openAsset(true)">在 Finder 中显示</button></div>
    <section class="kd-detail-content"><p v-for="paragraph in paragraphs.slice(0, visibleParagraphs)" :key="paragraph">{{ paragraph }}</p><button v-if="visibleParagraphs < paragraphs.length" class="kd-secondary-button" type="button" @click="visibleParagraphs += 8">继续阅读（还有 {{ paragraphs.length - visibleParagraphs }} 段）</button></section>
    <IngestionHistory v-if="jobHistoryEnabled" :error="jobsError" :is-loading="jobsLoading" :jobs="jobs" :on-retry="onRetryJobs" />
    <p v-if="error" class="kd-form-error">{{ error }}</p>
  </article>
</template>
