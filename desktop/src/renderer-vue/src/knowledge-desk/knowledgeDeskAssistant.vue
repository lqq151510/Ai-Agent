<script lang="ts">
import type {
  LocalAssistantMessage,
  LocalAssistantSession,
  ModelProvider,
} from './knowledgeDeskApi'

export interface LocalAssistantPageProps {
  defaultModelSourceId?: string | null
  initialDraft?: { id: number; text: string } | null
  modelProviders: ModelProvider[]
  onConsumeInitialDraft?: (id: number) => void
  onOpenModelSettings: () => void
  onSaveAssistantMessage?: (message: LocalAssistantMessage) => Promise<void>
}

export type ActiveStream = {
  requestId: string
  sessionId: string
  userMessageId: string
  assistantMessageId: string
}
</script>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  BookmarkPlus,
  Bot,
  CheckCircle2,
  ChevronDown,
  Download,
  Loader2,
  MessageCircle,
  Plus,
  RefreshCw,
  SendHorizontal,
  Settings2,
  ShieldCheck,
  Trash2,
  User,
} from '@lucide/vue'
import {
  canExportLocalAssistantSession,
  canUseLocalAssistant,
  deleteLocalAssistantSession,
  exportLocalAssistantSession,
  listLocalAssistantMessages,
  listLocalAssistantSessions,
  sendLocalAssistantMessage,
  subscribeLocalAssistantStream,
  type LocalAssistantStreamEvent,
} from './knowledgeDeskApi'
import { EmptyBlock } from './shared'

const props = withDefaults(defineProps<LocalAssistantPageProps>(), {
  defaultModelSourceId: null,
  initialDraft: null,
})

const bridgeAvailable = canUseLocalAssistant()
const exportAvailable = canExportLocalAssistantSession()

const isUsableCloudModel = (provider: ModelProvider) => (
  provider.providerType !== 'local_compatible'
  && provider.enabled
  && provider.lastCheckStatus === 'ok'
  && provider.model.trim().length > 0
)

const localTitleFromMessage = (message: string) => (
  message.replace(/\s+/g, ' ').trim().slice(0, 120) || '新对话'
)

const sessionTime = (value?: string) => {
  if (!value) return ''
  const time = new Date(value)
  if (Number.isNaN(time.getTime())) return ''
  return time.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}

const appendDistinctSessions = (
  current: LocalAssistantSession[],
  incoming: LocalAssistantSession[],
) => {
  const sessionIds = new Set(current.map((session) => session.id))
  const merged = [...current]
  for (const session of incoming) {
    if (sessionIds.has(session.id)) continue
    sessionIds.add(session.id)
    merged.push(session)
  }
  return merged
}

const selectedModelSourceId = ref('')
const sessions = ref<LocalAssistantSession[]>([])
const activeSessionId = ref<string | null>(null)
const messages = ref<LocalAssistantMessage[]>([])
const draft = ref('')
const error = ref<string | null>(null)
const isLoadingSessions = ref(false)
const isLoadingMoreSessions = ref(false)
const nextSessionPage = ref<number | null>(null)
const isLoadingMessages = ref(false)
const isSending = ref(false)
const isExporting = ref(false)
const savingMessageId = ref<string | null>(null)
const savedMessageIds = ref<Set<string>>(new Set())
const exportMessage = ref<string | null>(null)

const activeStreamRef = ref<ActiveStream | null>(null)
const pendingMessageIdsRef = ref<Pick<ActiveStream, 'userMessageId' | 'assistantMessageId'> | null>(null)
const messageLoadRequestRef = ref(0)
const appliedDraftSeedRef = ref<number | null>(null)

const availableModels = computed(() => props.modelProviders.filter(isUsableCloudModel))
const resolvedModelSourceId = computed(() => (
  availableModels.value.some((provider) => provider.id === selectedModelSourceId.value)
    ? selectedModelSourceId.value
    : props.defaultModelSourceId && availableModels.value.some((provider) => provider.id === props.defaultModelSourceId)
      ? props.defaultModelSourceId
      : availableModels.value[0]?.id ?? ''
))
const selectedModel = computed(() => (
  availableModels.value.find((provider) => provider.id === resolvedModelSourceId.value) ?? null
))
const visibleMessages = computed(() => (activeSessionId.value ? messages.value : []))

const loadMessages = async (sessionId: string, showLoading = true) => {
  const requestId = messageLoadRequestRef.value + 1
  messageLoadRequestRef.value = requestId
  if (showLoading) isLoadingMessages.value = true
  try {
    const nextMessages = await listLocalAssistantMessages(sessionId)
    if (messageLoadRequestRef.value !== requestId) return
    messages.value = nextMessages
  } catch (loadError) {
    if (messageLoadRequestRef.value !== requestId) return
    error.value = loadError instanceof Error ? loadError.message : String(loadError)
  } finally {
    if (messageLoadRequestRef.value === requestId && showLoading) {
      isLoadingMessages.value = false
    }
  }
}

const refreshSessions = async () => {
  if (!bridgeAvailable) return []
  isLoadingSessions.value = true
  try {
    const sessionPage = await listLocalAssistantSessions()
    const nextSessions = sessionPage.sessions
    sessions.value = nextSessions
    nextSessionPage.value = sessionPage.nextPage
    activeSessionId.value = activeSessionId.value && nextSessions.some((session) => session.id === activeSessionId.value)
      ? activeSessionId.value
      : nextSessions[0]?.id ?? null
    return nextSessions
  } catch (loadError) {
    error.value = loadError instanceof Error ? loadError.message : String(loadError)
    return []
  } finally {
    isLoadingSessions.value = false
  }
}

const loadMoreSessions = async () => {
  const page = nextSessionPage.value
  if (page === null || isSending.value || isLoadingSessions.value || isLoadingMoreSessions.value) return

  error.value = null
  isLoadingMoreSessions.value = true
  try {
    const sessionPage = await listLocalAssistantSessions(page)
    sessions.value = appendDistinctSessions(sessions.value, sessionPage.sessions)
    nextSessionPage.value = sessionPage.nextPage
  } catch (loadError) {
    error.value = loadError instanceof Error ? loadError.message : String(loadError)
  } finally {
    isLoadingMoreSessions.value = false
  }
}

const startNewConversation = () => {
  if (isSending.value) return
  messageLoadRequestRef.value += 1
  activeSessionId.value = null
  messages.value = []
  draft.value = ''
  error.value = null
  exportMessage.value = null
}

const selectSession = (sessionId: string) => {
  if (isSending.value || sessionId === activeSessionId.value) return
  error.value = null
  exportMessage.value = null
  activeSessionId.value = sessionId
}

const deleteSession = async (sessionId: string) => {
  if (isSending.value) return
  const session = sessions.value.find((candidate) => candidate.id === sessionId)
  if (!window.confirm(`删除“${session?.title ?? '这条对话'}”及其消息记录吗？此操作无法撤销。`)) return

  error.value = null
  try {
    await deleteLocalAssistantSession(sessionId)
    const remaining = sessions.value.filter((candidate) => candidate.id !== sessionId)
    sessions.value = remaining
    if (activeSessionId.value === sessionId) {
      messageLoadRequestRef.value += 1
      activeSessionId.value = remaining[0]?.id ?? null
      messages.value = []
      exportMessage.value = null
    }
  } catch (deleteError) {
    error.value = deleteError instanceof Error ? deleteError.message : String(deleteError)
  }
}

const exportSession = async () => {
  if (!activeSessionId.value || isSending.value || isExporting.value) return
  error.value = null
  exportMessage.value = null
  isExporting.value = true
  try {
    const result = await exportLocalAssistantSession(activeSessionId.value)
    if (!result.canceled) {
      exportMessage.value = '已导出为 Markdown。'
    }
  } catch (exportError) {
    error.value = exportError instanceof Error ? exportError.message : String(exportError)
  } finally {
    isExporting.value = false
  }
}

const sendMessage = async () => {
  const message = draft.value.trim()
  if (!message || isSending.value) return
  const model = selectedModel.value
  if (!model) {
    error.value = '请先在个人中心测试并选择一个云端模型。'
    return
  }

  const nonce = `${Date.now()}-${Math.random().toString(16).slice(2)}`
  const userMessageId = `pending-user-${nonce}`
  const assistantMessageId = `pending-assistant-${nonce}`
  pendingMessageIdsRef.value = { userMessageId, assistantMessageId }
  error.value = null
  exportMessage.value = null
  draft.value = ''
  isSending.value = true
  messages.value = [
    ...messages.value,
    { id: userMessageId, role: 'user', content: message, pending: true },
    { id: assistantMessageId, role: 'assistant', content: '', pending: true },
  ]

  try {
    const sent = await sendLocalAssistantMessage({
      message,
      sessionId: activeSessionId.value ?? undefined,
      modelSourceId: model.id,
      model: model.model,
    })
    if (!activeStreamRef.value || activeStreamRef.value.requestId !== sent.requestId) {
      activeStreamRef.value = {
        requestId: sent.requestId,
        sessionId: sent.sessionId,
        userMessageId,
        assistantMessageId,
      }
    }
    activeSessionId.value = sent.sessionId
    if (sent.isNewSession) {
      sessions.value = [
        {
          id: sent.sessionId,
          title: localTitleFromMessage(message),
          model: model.model,
        },
        ...sessions.value.filter((session) => session.id !== sent.sessionId),
      ]
    }
  } catch (sendError) {
    messages.value = messages.value.filter((item) => (
      item.id !== userMessageId && item.id !== assistantMessageId
    ))
    pendingMessageIdsRef.value = null
    activeStreamRef.value = null
    isSending.value = false
    error.value = sendError instanceof Error ? sendError.message : String(sendError)
  }
}

const onDraftKeyDown = (event: KeyboardEvent) => {
  if (event.key !== 'Enter' || event.shiftKey) return
  event.preventDefault()
  void sendMessage()
}

const onSelectModel = (event: Event) => {
  selectedModelSourceId.value = (event.target as HTMLSelectElement).value
}

const saveAssistantMessage = async (message: LocalAssistantMessage) => {
  if (!props.onSaveAssistantMessage || message.pending || savingMessageId.value || savedMessageIds.value.has(message.id)) return
  savingMessageId.value = message.id
  error.value = null
  try {
    await props.onSaveAssistantMessage(message)
    const next = new Set(savedMessageIds.value)
    next.add(message.id)
    savedMessageIds.value = next
  } catch (saveError) {
    error.value = saveError instanceof Error ? saveError.message : String(saveError)
  } finally {
    savingMessageId.value = null
  }
}

const handleStreamEvent = (event: LocalAssistantStreamEvent) => {
  if (event.type === 'started') {
    const pending = pendingMessageIdsRef.value
    if (!pending) return
    activeStreamRef.value = {
      requestId: event.requestId,
      sessionId: event.sessionId,
      ...pending,
    }
    activeSessionId.value = event.sessionId
    return
  }

  const activeStream = activeStreamRef.value
  if (!activeStream || activeStream.requestId !== event.requestId) return

  if (event.type === 'chunk') {
    const chunk = event.chunk ?? ''
    messages.value = messages.value.map((message) => (
      message.id === activeStream.assistantMessageId
        ? { ...message, content: `${message.content}${chunk}`, pending: true }
        : message
    ))
    return
  }

  if (event.type === 'done') {
    messages.value = messages.value.map((message) => (
      message.id === activeStream.assistantMessageId
        ? {
          ...message,
          content: event.reply || message.content || '云端模型没有返回文本。',
          pending: false,
        }
        : message
    ))
    activeStreamRef.value = null
    pendingMessageIdsRef.value = null
    isSending.value = false
    void refreshSessions()
    void loadMessages(event.sessionId, false)
    return
  }

  // error case (event.type === 'error')
  error.value = event.message || '云端模型暂时无法响应。'
  messages.value = messages.value.filter((message) => (
    message.id !== activeStream.assistantMessageId || message.content.trim().length > 0
  ))
  activeStreamRef.value = null
  pendingMessageIdsRef.value = null
  isSending.value = false
  void refreshSessions()
  void loadMessages(event.sessionId, false)
}

// Mirror the React useEffect that seeds the draft from an incoming initialDraft.
watch(
  () => [
    availableModels.value.length,
    bridgeAvailable,
    props.initialDraft,
    isSending.value,
    props.onConsumeInitialDraft,
  ],
  () => {
    if (
      !props.initialDraft
      || !bridgeAvailable
      || availableModels.value.length === 0
      || isSending.value
      || appliedDraftSeedRef.value === props.initialDraft.id
    ) {
      return
    }
    appliedDraftSeedRef.value = props.initialDraft.id
    messageLoadRequestRef.value += 1
    activeSessionId.value = null
    messages.value = []
    draft.value = props.initialDraft.text.slice(0, 8000)
    error.value = null
    props.onConsumeInitialDraft?.(props.initialDraft.id)
  },
  { immediate: true },
)

// Mirror the React useEffect that loads messages when the active session changes.
watch(
  () => activeSessionId.value,
  () => {
    if (
      !bridgeAvailable
      || !activeSessionId.value
      || activeStreamRef.value?.sessionId === activeSessionId.value
    ) {
      return
    }
    void loadMessages(activeSessionId.value)
  },
  { immediate: true },
)

// The SSE stream subscription must be torn down on unmount so we never leak it.
let unsubscribe: (() => void) | undefined

onMounted(() => {
  // Session history is external desktop-service state and must be synchronized on mount.
  void refreshSessions()
  unsubscribe = subscribeLocalAssistantStream(handleStreamEvent)
})

onUnmounted(() => {
  unsubscribe?.()
})
</script>

<template>
  <div class="kd-assistant-page">
    <EmptyBlock
      v-if="!bridgeAvailable"
      title="云端助手仅在桌面端可用"
      description="浏览器预览不会连接模型或伪造云端对话。请从桌面端启动知识工作台。"
      :icon="MessageCircle"
      :action="{ label: '打开个人中心', onClick: onOpenModelSettings }"
    />
    <EmptyBlock
      v-else-if="availableModels.length === 0"
      title="还没有可用的云端模型"
      description="先在个人中心添加并测试云端模型。助手只会使用已保存且测试通过的模型配置。"
      :icon="Settings2"
      :action="{ label: '配置云端模型', onClick: onOpenModelSettings }"
    />
    <template v-else>
      <header class="kd-assistant-hero">
        <div>
          <p>FOCUS ROOM / CLOUD MODEL</p>
          <h2>让当前的线索，在不中断思考的地方继续。</h2>
          <span><ShieldCheck :size="14" /> 仅使用已保存且通过测试的云端模型；不读取文件、不执行命令。</span>
        </div>
        <div class="kd-assistant-hero-actions">
          <label class="kd-assistant-model-select">
            <span>当前模型</span>
            <select
              aria-label="选择云端模型"
              :value="resolvedModelSourceId"
              @change="onSelectModel"
            >
              <option v-for="provider in availableModels" :key="provider.id" :value="provider.id">{{ provider.provider }} · {{ provider.model }}</option>
            </select>
          </label>
          <button class="kd-secondary-button" type="button" @click="onOpenModelSettings">
            <Settings2 :size="16" /> 管理模型
          </button>
        </div>
      </header>

      <div class="kd-assistant-layout">
        <aside class="kd-assistant-sessions" aria-label="云端助手对话列表">
          <div class="kd-assistant-sessions-header">
            <div>
              <span>对话记录</span>
              <strong>{{ nextSessionPage === null ? `${sessions.length} 条` : `已加载 ${sessions.length} 条` }}</strong>
            </div>
            <button class="kd-icon-button" type="button" aria-label="新建对话" :disabled="isSending" @click="startNewConversation">
              <Plus :size="17" />
            </button>
          </div>
          <button class="kd-assistant-new" type="button" :disabled="isSending" @click="startNewConversation">
            <Plus :size="16" /> 新对话
          </button>
          <div class="kd-assistant-session-list">
            <div v-if="isLoadingSessions" class="kd-assistant-loading"><Loader2 class="kd-spin" :size="17" /> 正在读取…</div>
            <p v-else-if="!isLoadingSessions && sessions.length === 0" class="kd-assistant-empty-list">
              {{ nextSessionPage === null ? '第一条消息会自动保存成新对话。' : '最近记录中还没有云端助手对话，可继续加载更早记录。' }}
            </p>
            <div
              v-for="session in sessions"
              :key="session.id"
              :class="`kd-assistant-session ${activeSessionId === session.id ? 'is-active' : ''}`"
            >
              <button type="button" :disabled="isSending" @click="selectSession(session.id)">
                <strong>{{ session.title }}</strong>
                <span>{{ session.model }}{{ sessionTime(session.updatedAt) ? ` · ${sessionTime(session.updatedAt)}` : '' }}</span>
              </button>
              <button
                type="button"
                class="kd-assistant-session-delete"
                :disabled="isSending"
                :aria-label="`删除对话：${session.title}`"
                @click="void deleteSession(session.id)"
              >
                <Trash2 :size="14" />
              </button>
            </div>
            <button
              v-if="nextSessionPage !== null"
              type="button"
              class="kd-assistant-load-more"
              :disabled="isSending || isLoadingSessions || isLoadingMoreSessions"
              @click="void loadMoreSessions()"
            >
              <Loader2 v-if="isLoadingMoreSessions" class="kd-spin" :size="15" />
              <ChevronDown v-else :size="15" />
              {{ isLoadingMoreSessions ? '正在加载…' : '加载更早的对话' }}
            </button>
          </div>
        </aside>

        <section class="kd-assistant-conversation" aria-label="云端助手对话">
          <header class="kd-assistant-conversation-header">
            <div>
              <Bot :size="18" />
              <div>
                <strong>{{ activeSessionId ? (sessions.find((session) => session.id === activeSessionId)?.title ?? '当前对话') : '新对话' }}</strong>
                <span>{{ selectedModel?.provider }} · {{ selectedModel?.model }}</span>
              </div>
            </div>
            <div class="kd-assistant-conversation-actions">
              <button
                v-if="exportAvailable"
                type="button"
                class="kd-secondary-button"
                :disabled="!activeSessionId || isLoadingMessages || isSending || isExporting"
                @click="void exportSession()"
              >
                <Loader2 v-if="isExporting" class="kd-spin" :size="15" />
                <Download v-else :size="15" />
                {{ isExporting ? '导出中' : '导出 Markdown' }}
              </button>
              <button
                type="button"
                class="kd-secondary-button"
                :disabled="!activeSessionId || isLoadingMessages || isSending"
                @click="activeSessionId && void loadMessages(activeSessionId)"
              >
                <RefreshCw :size="15" /> 刷新
              </button>
            </div>
          </header>

          <div class="kd-assistant-messages" aria-live="polite">
            <div v-if="isLoadingMessages" class="kd-assistant-loading"><Loader2 class="kd-spin" :size="18" /> 正在读取对话…</div>
            <div
              v-else-if="!isLoadingMessages && visibleMessages.length === 0"
              class="kd-assistant-welcome"
            >
              <MessageCircle :size="24" />
              <strong>从一句话开始</strong>
              <span>例如：帮我把今天读到的内容整理成三个要点。</span>
            </div>
            <article
              v-for="message in visibleMessages"
              :key="message.id"
              :class="`kd-assistant-message kd-assistant-message--${message.role}`"
            >
              <div class="kd-assistant-message-header">
                <span class="kd-assistant-message-role">
                  <template v-if="message.role === 'user'">
                    <User :size="12" />
                    <span>你</span>
                  </template>
                  <template v-else>
                    <Bot :size="12" />
                    <span>云端助手</span>
                  </template>
                </span>
              </div>
              <p>{{ message.content || (message.pending ? '正在思考…' : '') }}</p>
              <div v-if="message.pending && message.role === 'assistant'" class="kd-assistant-thinking">
                <Loader2 class="kd-spin" :size="13" />
                <span>正在生成回复…</span>
              </div>
              <div
                v-if="message.role === 'assistant' && !message.pending && !message.id.startsWith('pending-assistant-') && message.content.trim() && onSaveAssistantMessage"
                class="kd-assistant-message-actions"
              >
                <button
                  type="button"
                  :disabled="savingMessageId !== null || savedMessageIds.has(message.id)"
                  @click="void saveAssistantMessage(message)"
                >
                  <Loader2 v-if="savingMessageId === message.id" class="kd-spin" :size="13" />
                  <CheckCircle2 v-else-if="savedMessageIds.has(message.id)" :size="13" />
                  <BookmarkPlus v-else :size="13" />
                  {{ savedMessageIds.has(message.id) ? '已收进知识库' : '收进知识库' }}
                </button>
              </div>
            </article>
          </div>

          <p v-if="error" class="kd-assistant-error" role="alert">{{ error }}</p>
          <p v-if="exportMessage" class="kd-assistant-export-message" role="status">{{ exportMessage }}</p>
          <div class="kd-assistant-composer">
            <div class="kd-assistant-composer-box">
              <textarea
                v-model="draft"
                aria-label="向云端助手发送消息"
                :disabled="isSending"
                maxlength="8000"
                placeholder="写下一个问题、想法，或需要整理的内容…"
                rows="2"
                @keydown="onDraftKeyDown"
              />
              <div class="kd-assistant-composer-footer">
                <div class="kd-assistant-composer-hint">
                  <span
                    v-if="selectedModel"
                    class="kd-assistant-model-pill"
                    :title="`${selectedModel.provider} · ${selectedModel.model}`"
                  >
                    <span class="kd-assistant-model-pill__dot" />
                    {{ selectedModel.model }}
                  </span>
                  <span>Enter 发送 · Shift + Enter 换行</span>
                </div>
                <button
                  type="button"
                  class="kd-primary-button"
                  :disabled="!draft.trim() || isSending"
                  @click="void sendMessage()"
                >
                  <Loader2 v-if="isSending" class="kd-spin" :size="15" />
                  <SendHorizontal v-else :size="15" />
                  <span>{{ isSending ? '生成中' : '发送' }}</span>
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </template>
  </div>
</template>
