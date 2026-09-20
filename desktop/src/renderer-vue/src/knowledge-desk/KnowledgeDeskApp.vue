<script lang="ts">
import type { Component } from 'vue'
import type { MainPage } from './knowledgeDeskTypes'

export interface PageNavItem {
  id: MainPage
  label: string
  icon: Component
  badge?: string
}
</script>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import {
  BookOpen,
  Clock3,
  FileText,
  FolderArchive,
  Globe2,
  Inbox,
  LayoutDashboard,
  MessageCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Upload,
} from '@lucide/vue'
import {
  addManagedSourceFolder,
  archiveKnowledgeItem,
  canUseDesktopBackupPicker,
  canUseDesktopBatchFileImport,
  canUseDesktopFilePicker,
  canUseManagedSourceFolders,
  commitLocalKnowledgeFileBatch,
  createModelSource,
  deleteModelSource,
  exportKnowledgeDeskBackup,
  fallbackSnapshot,
  importBrowserKnowledgeFile,
  importKnowledgeDeskBackup,
  importKnowledgeItem,
  importLocalKnowledgeFile,
  inferModelSourceProviderType,
  listIngestionJobs,
  listKnowledgeItems,
  listManagedSourceFolders,
  loadKnowledgeDeskSnapshot,
  loadKnowledgeItemDetail,
  openManagedSourceAsset,
  organizeKnowledgeItem,
  organizeKnowledgeItems,
  pickKnowledgeDeskBackup,
  preflightLocalKnowledgeFileBatch,
  removeManagedSourceFolder,
  reprocessKnowledgeItem,
  restoreKnowledgeItem,
  saveKnowledgeDeskBackup,
  scanManagedSourceFolder,
  setManagedSourceFolderEnabled,
  testModelSource,
  updateKnowledgeDeskSettingsProfile,
  updateKnowledgeItem,
  type ImportKnowledgeDraft,
  type ImportModelSourceDraft,
  type KnowledgeDeskBackup,
  type KnowledgeDeskSnapshot,
  type KnowledgeIngestionJob,
  type KnowledgeItem,
  type ListKnowledgeItemsParams,
  type LocalFileBatchCommitResult,
  type LocalFileBatchPreflight,
  type ManagedSourceFolder,
  type ModelProvider,
  type UpdateKnowledgeItemDraft,
} from './knowledgeDeskApi'
import { Button } from '../components/ui'
import LocalAssistantPage from './knowledgeDeskAssistant.vue'
import ReviewPage from './knowledgeDeskReview.vue'
import SettingsPage from './knowledgeDeskSettings.vue'
import KnowledgeDeskMark from './KnowledgeDeskMark.vue'
import PageErrorBoundary from './components/PageErrorBoundary.vue'
import ArchivePage from './screens/ArchivePage.vue'
import ConnectionBanner from './screens/ConnectionBanner.vue'
import ContextRail from './screens/ContextRail.vue'
import DashboardPage from './screens/DashboardPage.vue'
import DetailPage from './screens/DetailPage.vue'
import ImportPanel from './screens/ImportPanel.vue'
import InboxPage from './screens/InboxPage.vue'
import LibraryPage from './screens/LibraryPage.vue'
import SearchPage from './screens/SearchPage.vue'
import type { ImportMode, SettingsTab } from './knowledgeDeskTypes'
import {
  applySnapshotItemUpdate,
  buildSearchCorpus,
  isCommandSearchShortcut,
  type InboxSegment,
  type KnowledgeWorkflowAction,
} from './knowledgeDeskViewModel'
import './knowledge-desk.css'

const pages: PageNavItem[] = [
  { id: 'dashboard', label: '工作台', icon: LayoutDashboard },
  { id: 'assistant', label: '本机助手', icon: MessageCircle },
  { id: 'inbox', label: '收集箱', icon: Inbox },
  { id: 'library', label: '知识库', icon: BookOpen },
  { id: 'review', label: '每日回顾', icon: Clock3 },
  { id: 'archive', label: '归档库', icon: FolderArchive },
  { id: 'search', label: '全局搜索', icon: Search },
]

const LOCAL_ASSISTANT_DRAFT_MAX_CHARS = 8_000
const LOCAL_ASSISTANT_BODY_CONTEXT_MAX_CHARS = 6_000
const LOCAL_ASSISTANT_TRUNCATION_NOTE =
  '\n\n（正文较长，以上为开头摘录；如需更多内容，请提示我继续补充。）'
const SIDEBAR_COLLAPSED_STORAGE_KEY = 'kd:sidebar_collapsed'

const buildAssistantDraftFromKnowledge = (
  item: KnowledgeItem,
  context: 'summary' | 'body' = 'summary',
) => {
  const title = (item.title.trim() || '未命名资料').slice(0, 240)
  const summary = (item.summary.trim() || '这条资料暂时还没有摘要。').slice(0, 1_600)
  const tags = (item.tags.length > 0 ? item.tags.join('、') : '未分类').slice(0, 600)
  const body = (item.cleanedContent || item.rawContent || '').trim()
  const instruction =
    context === 'body'
      ? '我想基于下面这条本机资料继续理解或延展。正文摘录由我主动带入，请优先依据正文回答；无法从正文确认时请明确说明。'
      : '我想基于下面这条本机资料继续理解或延展，请先结合标题、摘要和标签回答。'
  const metadata = [instruction, '', `标题：${title}`, `摘要：${summary}`, `标签：${tags}`]
  const question = '\n\n我的问题：'

  if (context !== 'body' || !body) {
    return `${metadata.join('\n')}${question}`.slice(0, LOCAL_ASSISTANT_DRAFT_MAX_CHARS)
  }

  const prefix = `${metadata.join('\n')}\n\n正文摘录（由我主动带入）：\n`
  const availableBodyChars = Math.max(
    0,
    Math.min(
      LOCAL_ASSISTANT_BODY_CONTEXT_MAX_CHARS,
      LOCAL_ASSISTANT_DRAFT_MAX_CHARS -
        prefix.length -
        question.length -
        LOCAL_ASSISTANT_TRUNCATION_NOTE.length,
    ),
  )
  const excerpt = body.slice(0, availableBodyChars).trimEnd()
  const truncationNote = excerpt.length < body.length ? LOCAL_ASSISTANT_TRUNCATION_NOTE : ''
  return `${prefix}${excerpt}${truncationNote}${question}`.slice(0, LOCAL_ASSISTANT_DRAFT_MAX_CHARS)
}

const runItemAction = async (item: KnowledgeItem, action: KnowledgeWorkflowAction) => {
  if (action === 'organize') return organizeKnowledgeItem(item)
  if (action === 'reprocess') return reprocessKnowledgeItem(item)
  if (action === 'restore') return restoreKnowledgeItem(item)
  return archiveKnowledgeItem(item)
}

const workflowNotice = (action: KnowledgeWorkflowAction, title: string) => {
  if (action === 'organize') return `已开始整理：${title}`
  if (action === 'reprocess') return `已重新整理：${title}`
  if (action === 'restore') return `已恢复：${title}`
  return `已归档：${title}`
}

const findSnapshotItem = (target: KnowledgeDeskSnapshot, itemId: string) =>
  target.libraryItems.find((item) => item.id === itemId) ??
  target.inboxItems.find((item) => item.id === itemId) ??
  target.archivedItems.find((item) => item.id === itemId) ??
  null

const activePage = ref<MainPage>('dashboard')
const isSidebarCollapsed = ref<boolean>(
  (() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true'
    } catch {
      return false
    }
  })(),
)
const settingsTab = ref<SettingsTab>('profile')
const libraryMode = ref<'list' | 'cards'>('list')
const activeInboxSegment = ref<InboxSegment>('all')
const snapshot = ref<KnowledgeDeskSnapshot>(fallbackSnapshot)
const isLoadingSnapshot = ref(true)
const selectedItem = ref<KnowledgeItem | null>(null)
const detailFetch = ref<{ isLoading: boolean; error: string | null }>({
  isLoading: false,
  error: null,
})
const detailJobs = ref<KnowledgeIngestionJob[]>([])
const detailJobsFetch = ref<{ isLoading: boolean; error: string | null }>({
  isLoading: false,
  error: null,
})
const importMode = ref<ImportMode | null>(null)
const isImporting = ref(false)
const isOrganizing = ref(false)
const itemActionState = ref<{ itemId: string; action: KnowledgeWorkflowAction } | null>(null)
const notice = ref<{ message: string; type: 'success' | 'error' | 'info' } | null>(null)
const managedSourceFolders = ref<ManagedSourceFolder[]>([])
const assistantDraft = ref<{ id: number; text: string } | null>(null)

// Mutable request tokens replace React's useRef counters.
let detailRequestId = 0
let detailJobsRequestId = 0
let noticeTimer: number | undefined
let isUnmounted = false

const desktopFilePickerAvailable = canUseDesktopFilePicker()
const desktopBatchFileImportAvailable = canUseDesktopBatchFileImport()
const desktopBackupPickerAvailable = canUseDesktopBackupPicker()
const desktopManagedSourceFoldersAvailable = canUseManagedSourceFolders()

const currentTitle = computed(() =>
  activePage.value === 'settings'
    ? '个人中心'
    : (pages.find((page) => page.id === activePage.value)?.label ?? '工作台'),
)
const inboxItems = computed(() => snapshot.value.inboxItems)
const libraryItems = computed(() => snapshot.value.libraryItems)
const archivedItems = computed(() => snapshot.value.archivedItems)
const apiEnabled = computed(
  () => snapshot.value.status === 'ok' || snapshot.value.status === 'degraded',
)
const searchableItems = computed(() =>
  buildSearchCorpus(libraryItems.value, archivedItems.value, inboxItems.value),
)
const tags = computed(() =>
  snapshot.value.tags.length > 0
    ? snapshot.value.tags
    : snapshot.value.dashboard.topTags.map((tag) => tag.name),
)
const detailItem = computed<KnowledgeItem>(
  () =>
    selectedItem.value ??
    libraryItems.value[0] ??
    inboxItems.value[0] ??
    archivedItems.value[0] ??
    fallbackSnapshot.libraryItems[0]!,
)

function getPageBadge(page: PageNavItem): string | undefined {
  if (page.id === 'inbox' && snapshot.value.inboxItems.length > 0) {
    return String(snapshot.value.inboxItems.length)
  }
  if (page.id === 'archive' && snapshot.value.storage.archivedItems > 0) {
    return String(snapshot.value.storage.archivedItems)
  }
  if (page.id === 'review' && snapshot.value.dashboard.review.dueCount > 0) {
    return String(snapshot.value.dashboard.review.dueCount)
  }
  return page.badge
}

function goToPage(page: MainPage) {
  activePage.value = page
}

function toggleSidebar() {
  const next = !isSidebarCollapsed.value
  try {
    localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(next))
  } catch {
    // ignore
  }
  isSidebarCollapsed.value = next
}

function syncSelectedItem(nextSnapshot: KnowledgeDeskSnapshot) {
  selectedItem.value =
    selectedItem.value ??
    nextSnapshot.libraryItems[0] ??
    nextSnapshot.inboxItems[0] ??
    nextSnapshot.archivedItems[0] ??
    null
}

async function refreshSnapshot() {
  isLoadingSnapshot.value = true
  try {
    const nextSnapshot = await loadKnowledgeDeskSnapshot()
    snapshot.value = nextSnapshot
    syncSelectedItem(nextSnapshot)
    isLoadingSnapshot.value = false
    return nextSnapshot
  } catch (error) {
    isLoadingSnapshot.value = false
    throw error
  }
}

function showNotice(message: string, type: 'success' | 'error' | 'info' = 'success') {
  notice.value = { message, type }
  // Clear any pending timer so a rapid second notice is not dismissed early by the first one.
  if (noticeTimer !== undefined) window.clearTimeout(noticeTimer)
  noticeTimer = window.setTimeout(() => {
    notice.value = null
  }, 3200)
}

async function refreshManagedSourceFolders(isActive: () => boolean = () => true) {
  if (!desktopManagedSourceFoldersAvailable) {
    if (isActive()) managedSourceFolders.value = []
    return []
  }
  const folders = await listManagedSourceFolders()
  if (isActive()) managedSourceFolders.value = folders
  return folders
}

async function handleAddManagedSourceFolder() {
  await addManagedSourceFolder()
  await refreshManagedSourceFolders()
}

async function handleSetManagedSourceFolderEnabled(folderId: string, enabled: boolean) {
  await setManagedSourceFolderEnabled(folderId, enabled)
  await refreshManagedSourceFolders()
  showNotice(enabled ? '已恢复资料夹监听。' : '已暂停资料夹监听。')
}

async function handleScanManagedSourceFolder(folderId: string) {
  await scanManagedSourceFolder(folderId)
  await refreshManagedSourceFolders()
  showNotice('已开始扫描本机资料夹。', 'info')
}

async function handleRemoveManagedSourceFolder(folderId: string) {
  await removeManagedSourceFolder(folderId)
  await refreshManagedSourceFolders()
  showNotice('已停止并移除资料夹监听；原目录和已收录原件均未删除。', 'info')
}

async function handleOpenManagedSourceAsset(assetId: string, reveal = false) {
  await openManagedSourceAsset(assetId, reveal)
  showNotice(
    reveal ? '已在 Finder 中定位受管原件。' : '已使用系统默认应用打开受管原件。',
    'info',
  )
}

async function loadDetailJobs(itemId: string) {
  const requestId = ++detailJobsRequestId
  detailJobs.value = []
  detailJobsFetch.value = { isLoading: true, error: null }
  try {
    const jobs = await listIngestionJobs({ knowledgeItemId: itemId, limit: 20 })
    if (detailJobsRequestId !== requestId) return
    detailJobs.value = jobs
    detailJobsFetch.value = { isLoading: false, error: null }
  } catch (error) {
    if (detailJobsRequestId !== requestId) return
    detailJobsFetch.value = {
      isLoading: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function handleImportSubmit(draft: ImportKnowledgeDraft) {
  isImporting.value = true
  try {
    const item = await importKnowledgeItem(draft)
    selectedItem.value = item
    activePage.value = 'inbox'
    importMode.value = null
    await refreshSnapshot()
    showNotice(`已收集：${item.title}`)
  } catch (error) {
    importMode.value = null
    showNotice(error instanceof Error ? error.message : String(error), 'error')
  } finally {
    isImporting.value = false
  }
}

async function handleLocalFileImport(title?: string) {
  isImporting.value = true
  try {
    const item = await importLocalKnowledgeFile(title)
    if (!item) {
      importMode.value = null
      showNotice('已取消文件选择', 'info')
      return
    }
    selectedItem.value = item
    activePage.value = 'inbox'
    importMode.value = null
    await refreshSnapshot()
    showNotice(`已导入：${item.title}`)
  } catch (error) {
    importMode.value = null
    showNotice(error instanceof Error ? error.message : String(error), 'error')
  } finally {
    isImporting.value = false
  }
}

async function handlePreflightLocalFileBatch(): Promise<LocalFileBatchPreflight> {
  return preflightLocalKnowledgeFileBatch()
}

async function handleCommitLocalFileBatch(
  batchId: string,
  candidateIds: string[],
): Promise<LocalFileBatchCommitResult> {
  isImporting.value = true
  try {
    const result = await commitLocalKnowledgeFileBatch(batchId, candidateIds)
    if (result.imported.length > 0) {
      await refreshSnapshot()
      activePage.value = 'inbox'
    }
    showNotice(
      `本机导入完成：成功 ${result.imported.length} 个，跳过 ${result.skipped.length} 个，失败 ${result.failed.length} 个。`,
      result.failed.length > 0 ? 'info' : 'success',
    )
    return result
  } finally {
    isImporting.value = false
  }
}

async function handleBrowserFileImport(file: File, title?: string) {
  isImporting.value = true
  try {
    const item = await importBrowserKnowledgeFile(file, title)
    selectedItem.value = item
    activePage.value = 'inbox'
    importMode.value = null
    await refreshSnapshot()
    showNotice(`已导入：${item.title}`)
  } catch (error) {
    importMode.value = null
    showNotice(error instanceof Error ? error.message : String(error), 'error')
  } finally {
    isImporting.value = false
  }
}

async function handleOrganizeBatch() {
  isOrganizing.value = true
  try {
    const result = await organizeKnowledgeItems(true)
    await refreshSnapshot()
    showNotice(`整理完成：成功 ${result.succeeded} 条，失败 ${result.failed} 条`)
  } catch (error) {
    showNotice(error instanceof Error ? error.message : String(error), 'error')
  } finally {
    isOrganizing.value = false
  }
}

async function handleItemAction(item: KnowledgeItem, action: KnowledgeWorkflowAction) {
  itemActionState.value = { itemId: item.id, action }
  try {
    const nextItem = await runItemAction(item, action)

    if (snapshot.value.status === 'error' || snapshot.value.status === 'unknown') {
      snapshot.value = applySnapshotItemUpdate(snapshot.value, item, nextItem)
      if (selectedItem.value?.id === item.id) selectedItem.value = nextItem
    } else {
      const nextSnapshot = await refreshSnapshot()
      const refreshedItem = findSnapshotItem(nextSnapshot, nextItem.id) ?? nextItem
      if (selectedItem.value?.id === item.id) selectedItem.value = refreshedItem
    }

    if (
      (action === 'organize' || action === 'reprocess') &&
      (snapshot.value.status === 'ok' || snapshot.value.status === 'degraded')
    ) {
      void loadDetailJobs(nextItem.id)
    }

    showNotice(workflowNotice(action, nextItem.title))
  } catch (error) {
    const shouldRefreshFailedOrganize =
      (action === 'organize' || action === 'reprocess') &&
      (snapshot.value.status === 'ok' || snapshot.value.status === 'degraded')
    if (shouldRefreshFailedOrganize) {
      const nextSnapshot = await refreshSnapshot().catch(() => null)
      const refreshedItem = nextSnapshot ? findSnapshotItem(nextSnapshot, item.id) : undefined
      if (refreshedItem && selectedItem.value?.id === item.id) {
        selectedItem.value = refreshedItem
      }
      void loadDetailJobs(item.id)
    }
    showNotice(error instanceof Error ? error.message : String(error), 'error')
  } finally {
    itemActionState.value = null
  }
}

async function handleItemUpdate(item: KnowledgeItem, draft: UpdateKnowledgeItemDraft) {
  const nextItem = await updateKnowledgeItem(item, draft)

  if (snapshot.value.status === 'error' || snapshot.value.status === 'unknown') {
    snapshot.value = applySnapshotItemUpdate(snapshot.value, item, nextItem)
    if (selectedItem.value?.id === item.id) selectedItem.value = nextItem
  } else {
    const nextSnapshot = await refreshSnapshot()
    const refreshedItem = findSnapshotItem(nextSnapshot, nextItem.id) ?? nextItem
    if (selectedItem.value?.id === item.id) selectedItem.value = refreshedItem
  }

  showNotice('知识条目已更新。')
}

async function handleCreateLocalModel(
  draft: Pick<ImportModelSourceDraft, 'name' | 'baseUrl' | 'defaultModel' | 'apiKey'>,
) {
  try {
    const source = await createModelSource({
      ...draft,
      providerType: inferModelSourceProviderType(draft.baseUrl),
      apiKey: draft.apiKey.trim() || 'local',
      enabled: true,
      isDefault: false,
    })
    await testModelSource(source.id)
    await updateKnowledgeDeskSettingsProfile({
      defaultModelSourceId: source.id,
      summaryModelSourceId: source.id,
    })
    await refreshSnapshot()
    showNotice(`${source.provider} 已通过测试，并设为知识整理模型。`)
  } catch (error) {
    await refreshSnapshot().catch(() => undefined)
    const message = error instanceof Error ? error.message : String(error)
    showNotice(message, 'error')
    throw error
  }
}

async function handleTestModel(provider: ModelProvider) {
  try {
    const result = await testModelSource(provider.id)
    await refreshSnapshot()
    const message = result.message || `${provider.provider} 可以用于本机整理。`
    showNotice(message)
    return message
  } catch (error) {
    await refreshSnapshot().catch(() => undefined)
    const message = error instanceof Error ? error.message : String(error)
    showNotice(message, 'error')
    throw error
  }
}

async function handleDeleteModel(provider: ModelProvider) {
  try {
    await deleteModelSource(provider.id)
    await refreshSnapshot()
    showNotice(`${provider.provider} 已删除。`, 'info')
  } catch (error) {
    await refreshSnapshot().catch(() => undefined)
    const message = error instanceof Error ? error.message : String(error)
    showNotice(message, 'error')
    throw error
  }
}

async function handleUseForOrganization(provider: ModelProvider) {
  if (provider.lastCheckStatus !== 'ok') {
    const error = new Error('请先通过模型连通性测试，再将它用于知识整理。')
    showNotice(error.message, 'error')
    throw error
  }
  try {
    await updateKnowledgeDeskSettingsProfile({
      defaultModelSourceId: provider.id,
      summaryModelSourceId: provider.id,
    })
    await refreshSnapshot()
    showNotice(`${provider.provider} 已设为知识整理模型。`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    showNotice(message, 'error')
    throw error
  }
}

async function handleOrganizeModeChange(mode: 'manual' | 'auto') {
  try {
    await updateKnowledgeDeskSettingsProfile({ organizeMode: mode })
    await refreshSnapshot()
    showNotice(mode === 'auto' ? '已开启导入后自动整理。' : '已改为手动整理。')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    showNotice(message, 'error')
    throw error
  }
}

async function handleLoadKnowledgeItemsPage(params: ListKnowledgeItemsParams) {
  return listKnowledgeItems(params)
}

async function handleExportBackup() {
  const backup = await exportKnowledgeDeskBackup()
  const savedPath = await saveKnowledgeDeskBackup(backup)
  showNotice(
    savedPath ? `本机备份已保存：${savedPath}` : '已取消备份保存。',
    savedPath ? 'success' : 'info',
  )
  return savedPath !== null
}

async function handleImportBackup(backup: KnowledgeDeskBackup) {
  const result = await importKnowledgeDeskBackup(backup)
  await refreshSnapshot()
  showNotice(result.message || `已合并导入 ${result.importedItems} 条资料。`)
}

async function handlePickDesktopBackup() {
  const backup = await pickKnowledgeDeskBackup()
  if (!backup) {
    showNotice('已取消选择备份文件。', 'info')
    return false
  }
  await handleImportBackup(backup)
  return true
}

function openDetail(item: KnowledgeItem, alreadyLoaded = false) {
  const requestId = ++detailRequestId
  selectedItem.value = item
  activePage.value = 'detail'

  if (snapshot.value.status !== 'ok' && snapshot.value.status !== 'degraded') {
    detailFetch.value = { isLoading: false, error: null }
    detailJobsRequestId += 1
    detailJobs.value = []
    detailJobsFetch.value = { isLoading: false, error: null }
    return
  }

  void loadDetailJobs(item.id)
  if (alreadyLoaded) {
    detailFetch.value = { isLoading: false, error: null }
    return
  }
  detailFetch.value = { isLoading: true, error: null }
  void loadKnowledgeItemDetail(item.id)
    .then((fullItem) => {
      if (detailRequestId !== requestId) return
      selectedItem.value = fullItem
      detailFetch.value = { isLoading: false, error: null }
    })
    .catch((error) => {
      if (detailRequestId !== requestId) return
      detailFetch.value = {
        isLoading: false,
        error: error instanceof Error ? error.message : String(error),
      }
    })
}

function handleReviewOpenDetail(itemId: string) {
  const item = libraryItems.value.find((candidate) => candidate.id === itemId)
  if (item) {
    openDetail(item)
    return
  }
  void loadKnowledgeItemDetail(itemId)
    .then((fullItem) => openDetail(fullItem, true))
    .catch((error) =>
      showNotice(error instanceof Error ? error.message : String(error), 'error'),
    )
}

// Keeps the child prop contract (() => Promise<void>) while refreshSnapshot
// resolves to the loaded snapshot.
async function handleReviewCompleted(): Promise<void> {
  await refreshSnapshot()
}

function handleAskAssistant(targetItem: KnowledgeItem, context: 'summary' | 'body' = 'summary') {
  assistantDraft.value = {
    id: Date.now(),
    text: buildAssistantDraftFromKnowledge(targetItem, context),
  }
  activePage.value = 'assistant'
}

function handleConsumeInitialDraft(id: number) {
  if (assistantDraft.value?.id === id) assistantDraft.value = null
}

function openModelSettings() {
  settingsTab.value = 'models'
  activePage.value = 'settings'
}

function openModelSettingsFromAssistant() {
  openModelSettings()
}

async function handleSaveAssistantMessage(message: { content: string }) {
  const firstLine = message.content.replace(/\s+/g, ' ').trim().slice(0, 72)
  const item = await importKnowledgeItem({
    kind: 'snippet',
    title: `助手笔记：${firstLine || '未命名回答'}`,
    content: message.content,
  })
  await refreshSnapshot()
  showNotice(`已收进知识库：${item.title}`)
}

function handleKeyDown(event: KeyboardEvent) {
  // ⌘K or Ctrl+K for search
  if (isCommandSearchShortcut(event)) {
    event.preventDefault()
    activePage.value = 'search'
    return
  }

  // ⌘B or Ctrl+B for Toggle Sidebar
  if ((event.metaKey || event.ctrlKey) && (event.key === 'b' || event.key === 'B')) {
    event.preventDefault()
    toggleSidebar()
    return
  }

  // ⌘, for Settings
  if ((event.metaKey || event.ctrlKey) && event.key === ',') {
    event.preventDefault()
    activePage.value = 'settings'
    return
  }

  // ⌘N for New Note / Snippet
  if (
    (event.metaKey || event.ctrlKey) &&
    (event.key === 'n' || event.key === 'N') &&
    !event.shiftKey
  ) {
    event.preventDefault()
    importMode.value = 'snippet'
    return
  }

  // ⌘1 ~ ⌘7 for Quick Navigation
  if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey) {
    const pageMap: Record<string, MainPage> = {
      '1': 'dashboard',
      '2': 'assistant',
      '3': 'inbox',
      '4': 'library',
      '5': 'review',
      '6': 'archive',
      '7': 'search',
    }
    const targetPage = pageMap[event.key]
    if (targetPage) {
      event.preventDefault()
      activePage.value = targetPage
      return
    }
  }
}

onMounted(() => {
  void loadKnowledgeDeskSnapshot().then((nextSnapshot) => {
    if (isUnmounted) return
    snapshot.value = nextSnapshot
    syncSelectedItem(nextSnapshot)
    isLoadingSnapshot.value = false
  })

  void Promise.resolve()
    .then(() => refreshManagedSourceFolders(() => !isUnmounted))
    .catch(() => {
      if (!isUnmounted) managedSourceFolders.value = []
    })

  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  isUnmounted = true
  window.removeEventListener('keydown', handleKeyDown)
  if (noticeTimer !== undefined) window.clearTimeout(noticeTimer)
})
</script>

<template>
  <div :class="['kd-app', isSidebarCollapsed ? 'kd-app--collapsed' : '']">
    <aside :class="['kd-sidebar', isSidebarCollapsed ? 'kd-sidebar--collapsed' : '']">
      <div class="kd-sidebar-header">
        <div class="kd-brand" aria-label="知识工作台">
          <KnowledgeDeskMark class="kd-brand-mark" title="知识工作台" />
          <div class="kd-brand-info">
            <div class="kd-brand-name">知识工作台</div>
            <div class="kd-brand-subtitle">私人索引系统 / 01</div>
          </div>
        </div>
        <button
          class="kd-sidebar-toggle"
          type="button"
          :aria-label="isSidebarCollapsed ? '展开侧边栏' : '折叠侧边栏'"
          :title="isSidebarCollapsed ? '展开侧边栏 (⌘B)' : '折叠侧边栏 (⌘B)'"
          @click="toggleSidebar"
        >
          <PanelLeftOpen v-if="isSidebarCollapsed" :size="15" />
          <PanelLeftClose v-else :size="15" />
        </button>
      </div>

      <nav class="kd-nav" aria-label="主导航">
        <button
          v-for="page in pages"
          :key="`kd-nav-item-${page.id}`"
          type="button"
          :class="['kd-nav-item', activePage === page.id ? 'is-active' : '']"
          :aria-current="activePage === page.id ? 'page' : undefined"
          :aria-label="`切换到${page.label}`"
          :title="isSidebarCollapsed ? page.label : undefined"
          @click="goToPage(page.id)"
        >
          <component :is="page.icon" :size="18" />
          <span>{{ page.label }}</span>
          <span v-if="getPageBadge(page)" class="kd-nav-badge">{{ getPageBadge(page) }}</span>
        </button>
      </nav>

      <div class="kd-import-box">
        <div class="kd-import-title">快速导入</div>
        <button
          class="kd-import-action"
          type="button"
          aria-label="导入网页摘录"
          :title="isSidebarCollapsed ? '网页摘录' : undefined"
          @click="importMode = 'web'"
        >
          <Globe2 :size="16" />
          <span>网页摘录</span>
        </button>
        <button
          class="kd-import-action"
          type="button"
          aria-label="导入本地文档"
          :title="isSidebarCollapsed ? '本地文档' : undefined"
          @click="importMode = 'file'"
        >
          <Upload :size="16" />
          <span>本地文档</span>
        </button>
        <button
          class="kd-import-action"
          type="button"
          aria-label="粘贴文本片段"
          :title="isSidebarCollapsed ? '粘贴内容' : undefined"
          @click="importMode = 'snippet'"
        >
          <FileText :size="16" />
          <span>粘贴内容</span>
        </button>
      </div>

      <button
        class="kd-user-card"
        type="button"
        aria-label="打开个人中心"
        :title="isSidebarCollapsed ? `${snapshot.profile.displayName} · 个人中心` : undefined"
        @click="goToPage('settings')"
      >
        <div class="kd-avatar">泽</div>
        <div class="kd-user-meta">
          <strong>{{ snapshot.profile.displayName }}</strong>
          <span
            :class="
              snapshot.status === 'error' || snapshot.status === 'unknown'
                ? 'kd-user-meta--warning'
                : ''
            "
          >
            {{
              snapshot.status === 'ok'
                ? '数据库已连接'
                : snapshot.status === 'degraded'
                  ? '数据库已连接 (部分服务异常)'
                  : '后端连接异常，当前为预览数据'
            }}
          </span>
        </div>
        <Settings :size="16" />
      </button>
    </aside>

    <main :class="['kd-main', `kd-main--${activePage}`]">
      <header class="kd-topbar">
        <div>
          <p class="kd-kicker">Knowledge Desk / Private Memory System</p>
          <h1>{{ currentTitle }}</h1>
        </div>
        <button
          class="kd-command-search"
          type="button"
          aria-keyshortcuts="Meta+K Control+K"
          aria-label="打开全局搜索"
          @click="goToPage('search')"
        >
          <Search :size="18" />
          <span>搜索主题、来源、标签、关键句</span>
          <kbd>⌘K</kbd>
        </button>
        <nav class="kd-mobile-nav" aria-label="移动端主导航">
          <button
            v-for="page in pages"
            :key="`kd-mobile-nav-item-${page.id}`"
            type="button"
            :class="['kd-mobile-nav-item', activePage === page.id ? 'is-active' : '']"
            :aria-current="activePage === page.id ? 'page' : undefined"
            :aria-label="`切换到${page.label}`"
            @click="goToPage(page.id)"
          >
            <component :is="page.icon" :size="18" />
            <span>{{ page.label }}</span>
            <span v-if="getPageBadge(page)" class="kd-nav-badge">{{ getPageBadge(page) }}</span>
          </button>
        </nav>
        <div class="kd-topbar-actions">
          <Button variant="primary" @click="importMode = 'snippet'">
            <Plus :size="16" />
            新建资料
          </Button>
          <span :class="['kd-sync-badge', `kd-sync-badge--${snapshot.status}`]">
            {{
              isLoadingSnapshot
                ? '同步中'
                : snapshot.status === 'ok'
                  ? '数据库已连接'
                  : snapshot.status === 'degraded'
                    ? '部分服务异常'
                    : '预览数据'
            }}
          </span>
          <button
            class="kd-refresh-button"
            type="button"
            aria-label="刷新数据"
            :disabled="isLoadingSnapshot"
            @click="refreshSnapshot()"
          >
            <RefreshCw :size="15" />
            {{ isLoadingSnapshot ? '同步中' : '刷新' }}
          </button>
        </div>
      </header>

      <SettingsPage
        v-if="activePage === 'settings'"
        :active-tab="settingsTab"
        :can-use-desktop-backup-picker="desktopBackupPickerAvailable"
        :can-use-managed-source-folders="desktopManagedSourceFoldersAvailable"
        :managed-source-folders="managedSourceFolders"
        :snapshot="snapshot"
        :on-add-managed-source-folder="handleAddManagedSourceFolder"
        :on-create-local-model="handleCreateLocalModel"
        :on-delete-model="handleDeleteModel"
        :on-export-backup="handleExportBackup"
        :on-import-backup="handleImportBackup"
        :on-organize-mode-change="handleOrganizeModeChange"
        :on-pick-desktop-backup="handlePickDesktopBackup"
        :on-remove-managed-source-folder="handleRemoveManagedSourceFolder"
        :on-scan-managed-source-folder="handleScanManagedSourceFolder"
        :on-set-managed-source-folder-enabled="handleSetManagedSourceFolderEnabled"
        :on-tab-change="(tab) => (settingsTab = tab)"
        :on-test-model="handleTestModel"
        :on-use-for-organization="handleUseForOrganization"
      />
      <div v-else class="kd-content-grid">
        <ConnectionBanner
          v-if="
            snapshot.status === 'error' ||
            snapshot.status === 'unknown' ||
            snapshot.status === 'degraded'
          "
          :error="snapshot.error"
          :is-loading="isLoadingSnapshot"
          :is-degraded="snapshot.status === 'degraded'"
          :on-retry="() => refreshSnapshot()"
        />
        <section class="kd-workspace" :aria-label="`${currentTitle} 主内容`">
          <PageErrorBoundary
            v-if="activePage === 'dashboard'"
            label="工作台"
            :on-reset="() => goToPage('dashboard')"
          >
            <DashboardPage
              :dashboard="snapshot.dashboard"
              :inbox-items="inboxItems"
              :is-loading="isLoadingSnapshot"
              :library-items="libraryItems"
              :tags="tags"
              :on-open-import="() => (importMode = 'snippet')"
              :on-open-detail="openDetail"
              :on-open-review="() => goToPage('review')"
            />
          </PageErrorBoundary>

          <PageErrorBoundary
            v-if="activePage === 'assistant'"
            label="本机助手"
            :on-reset="() => goToPage('assistant')"
          >
            <LocalAssistantPage
              :default-model-source-id="snapshot.profile.defaultModelSourceId"
              :initial-draft="assistantDraft"
              :model-providers="snapshot.modelProviders"
              :on-consume-initial-draft="handleConsumeInitialDraft"
              :on-open-model-settings="openModelSettingsFromAssistant"
              :on-save-assistant-message="handleSaveAssistantMessage"
            />
          </PageErrorBoundary>

          <PageErrorBoundary
            v-if="activePage === 'inbox'"
            label="收集箱"
            :on-reset="() => goToPage('inbox')"
          >
            <InboxPage
              :action-state="itemActionState"
              :active-segment="activeInboxSegment"
              :api-enabled="apiEnabled"
              :inbox-totals="snapshot.inboxTotals"
              :is-loading="isLoadingSnapshot"
              :is-organizing="isOrganizing"
              :items="inboxItems"
              :on-item-action="handleItemAction"
              :on-load-page="handleLoadKnowledgeItemsPage"
              :on-open-detail="openDetail"
              :on-organize-batch="handleOrganizeBatch"
              :on-segment-change="(segment) => (activeInboxSegment = segment)"
            />
          </PageErrorBoundary>

          <PageErrorBoundary
            v-if="activePage === 'library'"
            label="知识库"
            :on-reset="() => goToPage('library')"
          >
            <LibraryPage
              :api-enabled="apiEnabled"
              :is-loading="isLoadingSnapshot"
              :items="libraryItems"
              :mode="libraryMode"
              :tags="tags"
              :on-load-page="handleLoadKnowledgeItemsPage"
              :on-mode-change="(mode) => (libraryMode = mode)"
              :on-open-detail="openDetail"
            />
          </PageErrorBoundary>

          <PageErrorBoundary
            v-if="activePage === 'review'"
            label="每日回顾"
            :on-reset="() => goToPage('review')"
          >
            <ReviewPage
              :api-enabled="apiEnabled"
              :on-open-detail="handleReviewOpenDetail"
              :on-review-completed="handleReviewCompleted"
            />
          </PageErrorBoundary>

          <PageErrorBoundary
            v-if="activePage === 'archive'"
            label="归档库"
            :on-reset="() => goToPage('archive')"
          >
            <ArchivePage
              :action-state="itemActionState"
              :api-enabled="apiEnabled"
              :is-loading="isLoadingSnapshot"
              :items="archivedItems"
              :tags="tags"
              :on-item-action="handleItemAction"
              :on-load-page="handleLoadKnowledgeItemsPage"
              :on-open-detail="openDetail"
            />
          </PageErrorBoundary>

          <PageErrorBoundary
            v-if="activePage === 'detail'"
            label="详情"
            :on-reset="() => goToPage('dashboard')"
          >
            <DetailPage
              :key="detailItem.id"
              :action-state="itemActionState"
              :error="detailFetch.error"
              :is-loading="detailFetch.isLoading"
              :item="detailItem"
              :job-history-enabled="apiEnabled"
              :jobs="detailJobs"
              :jobs-error="detailJobsFetch.error"
              :jobs-loading="detailJobsFetch.isLoading"
              :on-action="handleItemAction"
              :on-ask-assistant="handleAskAssistant"
              :on-open-managed-source-asset="handleOpenManagedSourceAsset"
              :on-retry-jobs="() => loadDetailJobs(detailItem.id)"
              :on-update="handleItemUpdate"
            />
          </PageErrorBoundary>

          <PageErrorBoundary
            v-if="activePage === 'search'"
            label="全局搜索"
            :on-reset="() => goToPage('search')"
          >
            <SearchPage
              :api-enabled="apiEnabled"
              :available-tags="snapshot.tags"
              :searchable-items="searchableItems"
              :on-open-detail="openDetail"
            />
          </PageErrorBoundary>
        </section>
        <ContextRail
          :active-page="activePage"
          :selected-item="detailItem"
          :snapshot="snapshot"
        />
      </div>
    </main>

    <ImportPanel
      v-if="importMode"
      :is-submitting="isImporting"
      :mode="importMode"
      :can-use-desktop-batch-file-import="desktopBatchFileImportAvailable"
      :can-use-desktop-file-picker="desktopFilePickerAvailable"
      :on-close="() => (importMode = null)"
      :on-commit-local-file-batch="handleCommitLocalFileBatch"
      :on-preflight-local-file-batch="handlePreflightLocalFileBatch"
      :on-upload-browser-file="handleBrowserFileImport"
      :on-import-local-file="handleLocalFileImport"
      :on-submit="handleImportSubmit"
    />

    <div
      v-if="notice"
      :class="['kd-toast', `kd-toast-${notice.type}`]"
      role="status"
      aria-live="polite"
    >
      {{ notice.message }}
    </div>
  </div>
</template>
