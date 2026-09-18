<script lang="ts">
import type {
  ImportKnowledgeDraft,
  ImportKnowledgeKind,
  LocalFileBatchCommitResult,
  LocalFileBatchPreflight,
} from '../knowledgeDeskApi'
import type { ImportMode } from '../knowledgeDeskTypes'

export type ImportPanelStatus = 'idle' | 'submitting' | 'success' | 'error'

export interface ImportPanelProps {
  canUseDesktopBatchFileImport: boolean
  canUseDesktopFilePicker: boolean
  isSubmitting: boolean
  mode: ImportMode
  onClose: () => void
  onCommitLocalFileBatch: (batchId: string, candidateIds: string[]) => Promise<LocalFileBatchCommitResult>
  onPreflightLocalFileBatch: () => Promise<LocalFileBatchPreflight>
  onUploadBrowserFile: (file: File, title?: string) => Promise<void>
  onImportLocalFile: (title?: string) => Promise<void>
  onSubmit: (draft: ImportKnowledgeDraft) => Promise<void>
}
</script>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { CheckCircle2, FileText, FolderOpen, Loader2 } from '@lucide/vue'
import { FileDropZone, ErrorCard } from '../components'
import { KNOWLEDGE_FILE_ACCEPT } from '../knowledgeDeskFileTypes'
import LocalFileBatchPreflightList from './LocalFileBatchPreflightList.vue'
import LocalFileBatchResult from './LocalFileBatchResult.vue'

const props = withDefaults(defineProps<ImportPanelProps>(), {})

const browserFileInputRef = ref<HTMLInputElement | null>(null)
const title = ref('')
const source = ref('')
const content = ref('')
const validationError = ref<string | null>(null)
const selectedFile = ref<File | null>(null)
const localBatch = ref<LocalFileBatchPreflight | null>(null)
const selectedBatchCandidateIds = ref<string[]>([])
const batchResult = ref<LocalFileBatchCommitResult | null>(null)
const status = ref<ImportPanelStatus>('idle')
const statusMessage = ref<string | null>(null)

const isFileMode = computed(() => props.mode === 'file')
const sourceRequired = computed(() => props.mode === 'web')
const isBusy = computed(() => props.isSubmitting || status.value === 'submitting')
const readyBatchCandidateIds = computed<string[]>(() => (
  localBatch.value?.candidates
    .filter((candidate) => candidate.verdict === 'ready')
    .map((candidate) => candidate.candidateId) ?? []
))
const selectedReadyBatchCandidateIds = computed<string[]>(() => (
  selectedBatchCandidateIds.value.filter((candidateId) => (
    readyBatchCandidateIds.value.includes(candidateId)
  ))
))

const importModeTitle = (mode: ImportMode) => {
  if (mode === 'web') return '网页摘录收藏'
  if (mode === 'file') return '导入本机文档'
  return '粘贴内容'
}

const resetStatus = () => {
  status.value = 'idle'
  statusMessage.value = null
  validationError.value = null
}

const handleFileSelect = (file: File) => {
  selectedFile.value = file
  resetStatus()
}

const handlePreflightLocalBatch = async () => {
  resetStatus()
  batchResult.value = null
  localBatch.value = null
  selectedBatchCandidateIds.value = []
  status.value = 'submitting'
  statusMessage.value = '正在检查文件类型、大小和重复内容…'
  try {
    const batch = await props.onPreflightLocalFileBatch()
    if (batch.canceled) {
      status.value = 'idle'
      statusMessage.value = '已取消文件选择。'
      return
    }
    localBatch.value = batch
    selectedBatchCandidateIds.value = batch.candidates
      .filter((candidate) => candidate.verdict === 'ready')
      .map((candidate) => candidate.candidateId)
    status.value = 'idle'
    statusMessage.value = null
  } catch (submitError) {
    status.value = 'error'
    statusMessage.value = submitError instanceof Error ? submitError.message : String(submitError)
  }
}

const handleCommitLocalBatch = async () => {
  if (!localBatch.value?.batchId) {
    await handlePreflightLocalBatch()
    return
  }
  if (selectedReadyBatchCandidateIds.value.length === 0) {
    validationError.value = '请至少选择一份预检通过的文件。'
    return
  }

  validationError.value = null
  status.value = 'submitting'
  statusMessage.value = `正在依次导入 ${selectedReadyBatchCandidateIds.value.length} 份文件…`
  try {
    const result = await props.onCommitLocalFileBatch(localBatch.value.batchId, selectedReadyBatchCandidateIds.value)
    localBatch.value = null
    selectedBatchCandidateIds.value = []
    batchResult.value = result
    status.value = 'success'
    statusMessage.value = `导入完成：成功 ${result.imported.length} 个，跳过 ${result.skipped.length} 个，失败 ${result.failed.length} 个。`
  } catch (submitError) {
    // The main-process token is single-use, so a failed commit must start with a new preflight.
    localBatch.value = null
    selectedBatchCandidateIds.value = []
    status.value = 'error'
    statusMessage.value = submitError instanceof Error ? submitError.message : String(submitError)
  }
}

const handleChooseFile = async () => {
  if (props.canUseDesktopBatchFileImport) {
    await handlePreflightLocalBatch()
    return
  }
  if (!props.canUseDesktopFilePicker) {
    browserFileInputRef.value?.click()
    return
  }
  status.value = 'submitting'
  statusMessage.value = '正在打开系统文件选择器…'
  try {
    await props.onImportLocalFile(title.value)
    status.value = 'success'
    statusMessage.value = '文件导入成功'
  } catch (submitError) {
    status.value = 'error'
    statusMessage.value = submitError instanceof Error ? submitError.message : String(submitError)
  }
}

const handleBrowserFileSelected = async (event: Event) => {
  const input = event.currentTarget as HTMLInputElement
  const file = input.files?.[0]
  if (!file) {
    return
  }
  selectedFile.value = file
  status.value = 'submitting'
  statusMessage.value = `正在上传 ${file.name}…`
  try {
    await props.onUploadBrowserFile(file, title.value)
    status.value = 'success'
    statusMessage.value = '文件上传成功'
  } catch (submitError) {
    status.value = 'error'
    statusMessage.value = submitError instanceof Error ? submitError.message : String(submitError)
  }
  input.value = ''
}

const runImport = async () => {
  resetStatus()

  if (isFileMode.value) {
    if (props.canUseDesktopBatchFileImport) {
      await handleCommitLocalBatch()
      return
    }
    if (selectedFile.value && !props.canUseDesktopFilePicker) {
      status.value = 'submitting'
      statusMessage.value = `正在上传 ${selectedFile.value.name}…`
      try {
        await props.onUploadBrowserFile(selectedFile.value, title.value)
        status.value = 'success'
        statusMessage.value = '文件上传成功'
      } catch (submitError) {
        status.value = 'error'
        statusMessage.value = submitError instanceof Error ? submitError.message : String(submitError)
      }
      return
    }
    await handleChooseFile()
    return
  }

  if (sourceRequired.value && !source.value.trim()) {
    validationError.value = '网页摘录需要填写来源 URL。'
    return
  }
  if (!content.value.trim()) {
    validationError.value = '内容不能为空。'
    return
  }

  status.value = 'submitting'
  statusMessage.value = '正在导入到收集箱…'
  try {
    const kind: ImportKnowledgeKind = props.mode === 'web' ? 'web' : 'snippet'
    await props.onSubmit({
      kind,
      title: title.value,
      source: source.value,
      content: content.value,
    })
    status.value = 'success'
    statusMessage.value = '导入成功'
  } catch (submitError) {
    status.value = 'error'
    statusMessage.value = submitError instanceof Error ? submitError.message : String(submitError)
  }
}

const handleSubmit = (event: Event) => {
  event.preventDefault()
  void runImport()
}

const toggleCandidate = (candidateId: string, checked: boolean) => {
  selectedBatchCandidateIds.value = checked
    ? Array.from(new Set([...selectedBatchCandidateIds.value, candidateId]))
    : selectedBatchCandidateIds.value.filter((id) => id !== candidateId)
}
</script>

<template>
  <div class="kd-import-modal" role="dialog" aria-modal="true" aria-label="导入资料">
    <form class="kd-import-sheet" @submit="handleSubmit">
      <header>
        <div>
          <p class="kd-kicker">收集到收集箱</p>
          <h2>{{ importModeTitle(mode) }}</h2>
        </div>
        <button class="kd-icon-button" :disabled="isBusy" type="button" aria-label="关闭导入面板" @click="onClose">×</button>
      </header>

      <label v-if="!isFileMode || !canUseDesktopBatchFileImport" class="kd-field">
        <span>标题</span>
        <input
          :disabled="isBusy"
          :placeholder="isFileMode ? '可选，留空则使用文件名' : '可选，留空则按来源自动命名'"
          v-model="title"
        />
      </label>

      <div v-if="isFileMode" class="kd-import-file-area">
        <template v-if="canUseDesktopBatchFileImport">
          <button
            class="kd-batch-file-picker"
            :disabled="isBusy"
            type="button"
            @click="void handlePreflightLocalBatch()"
          >
            <FolderOpen :size="20" />
            <span>{{ localBatch ? '重新选择并预检文件' : '选择本机文件并预检' }}</span>
            <small>最多 20 个，每个不超过 20 MB</small>
          </button>
          <LocalFileBatchPreflightList
            v-if="localBatch"
            :candidates="localBatch.candidates"
            :disabled="isBusy"
            :selected-candidate-ids="selectedReadyBatchCandidateIds"
            :on-toggle="toggleCandidate"
          />
          <LocalFileBatchResult v-if="batchResult" :result="batchResult" />
        </template>
        <template v-else>
          <FileDropZone
            :disabled="isBusy"
            :file="selectedFile"
            :on-file-select="handleFileSelect"
            :title="canUseDesktopFilePicker ? '点击打开系统文件选择器，或拖拽文件到此处' : '拖拽文件到此处，或点击选择文件'"
          />
          <input
            v-if="!canUseDesktopFilePicker"
            ref="browserFileInputRef"
            :accept="KNOWLEDGE_FILE_ACCEPT"
            class="kd-hidden-file-input"
            type="file"
            @change="void handleBrowserFileSelected($event)"
          />
        </template>
        <div class="kd-import-file-types">
          <span><FileText :size="13" /> Markdown</span>
          <span><FileText :size="13" /> PDF</span>
          <span><FileText :size="13" /> Word / PowerPoint</span>
          <span><FileText :size="13" /> 纯文本 / HTML</span>
        </div>
      </div>

      <label v-if="!isFileMode && mode !== 'snippet'" class="kd-field">
        <span>来源 URL</span>
        <input
          :disabled="isBusy"
          placeholder="https://example.com/article"
          v-model="source"
        />
      </label>

      <label v-if="!isFileMode" class="kd-field">
        <span>摘录内容</span>
        <textarea
          :disabled="isBusy"
          placeholder="粘贴网页正文、Markdown 内容或临时摘录..."
          rows="9"
          v-model="content"
        />
      </label>

      <div v-if="validationError" class="kd-form-error">{{ validationError }}</div>

      <ErrorCard
        v-if="status === 'error' && statusMessage"
        description="导入失败，请检查文件类型或网络连接后重试。"
        :error="statusMessage"
        :on-retry="() => void runImport()"
        retry-label="重试"
        title="导入失败"
      />
      <div v-if="status === 'success' && statusMessage" class="kd-import-success">
        <CheckCircle2 :size="18" />
        <span>{{ statusMessage }}</span>
      </div>
      <div v-if="status === 'submitting' && statusMessage" class="kd-import-progress">
        <Loader2 :size="18" class="animate-spin" />
        <span>{{ statusMessage }}</span>
      </div>

      <footer>
        <p>
          <template v-if="isFileMode">
            <template v-if="canUseDesktopBatchFileImport">
              文件路径和 SHA-256 仅保留在本机主进程。预检会跳过批内重复与已入库的同字节文件，再逐个导入收集箱。
            </template>
            <template v-else>
              文件解析在后端完成，不需要手写路径。导入后内容会先进入收集箱。
            </template>
          </template>
          <template v-else>
            内容会先进入收集箱，后续可批量整理为摘要、标签与可检索知识条目。
          </template>
        </p>
        <div>
          <button class="kd-secondary-button" :disabled="isBusy" type="button" @click="onClose">取消</button>
          <button
            class="kd-primary-button"
            :disabled="isBusy || (isFileMode && canUseDesktopBatchFileImport && !!localBatch?.batchId && selectedReadyBatchCandidateIds.length === 0)"
            type="submit"
          >
            <template v-if="isBusy">
              <Loader2 :size="15" class="animate-spin" />
              导入中
            </template>
            <template v-else-if="isFileMode">
              <template v-if="canUseDesktopBatchFileImport">
                <template v-if="localBatch?.batchId">
                  导入已选 {{ selectedReadyBatchCandidateIds.length }} 个
                </template>
                <template v-else>
                  选择文件并预检
                </template>
              </template>
              <template v-else-if="canUseDesktopFilePicker">
                选择文件并导入
              </template>
              <template v-else>
                上传文件到收集箱
              </template>
            </template>
            <template v-else>
              导入收集箱
            </template>
          </button>
        </div>
      </footer>
    </form>
  </div>
</template>
