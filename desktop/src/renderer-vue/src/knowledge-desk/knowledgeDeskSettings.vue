<script lang="ts">
import type { Component } from 'vue'
import type { KnowledgeDeskBackup, KnowledgeDeskSnapshot, ManagedSourceFolder, ModelProvider } from './knowledgeDeskApi'
import type { SettingsTab } from './knowledgeDeskTypes'

export type CloudModelDraft = {
  name: string
  baseUrl: string
  defaultModel: string
  apiKey: string
}

export interface SettingsPageProps {
  activeTab: SettingsTab
  canUseDesktopBackupPicker: boolean
  canUseManagedSourceFolders: boolean
  managedSourceFolders: ManagedSourceFolder[]
  onTabChange: (tab: SettingsTab) => void
  snapshot: KnowledgeDeskSnapshot
  onCreateCloudModel: (draft: CloudModelDraft) => Promise<void>
  onDeleteModel: (provider: ModelProvider) => Promise<void>
  onExportBackup: () => Promise<boolean>
  onImportBackup: (backup: KnowledgeDeskBackup) => Promise<void>
  onPickDesktopBackup: () => Promise<boolean>
  onTestModel: (provider: ModelProvider) => Promise<string>
  onUseForOrganization: (provider: ModelProvider) => Promise<void>
  onOrganizeModeChange: (mode: 'manual' | 'auto') => Promise<void>
  onAddManagedSourceFolder: () => Promise<void>
  onRemoveManagedSourceFolder: (folderId: string) => Promise<void>
  onScanManagedSourceFolder: (folderId: string) => Promise<void>
  onSetManagedSourceFolderEnabled: (folderId: string, enabled: boolean) => Promise<void>
}

const initialCloudModelDraft: CloudModelDraft = {
  name: '云端模型',
  baseUrl: 'https://api.deepseek.com/v1',
  defaultModel: 'deepseek-flash',
  apiKey: '',
}
</script>

<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  AlertTriangle,
  Cloud,
  Download,
  FolderOpen,
  HardDrive,
  KeyRound,
  Link2,
  Loader2,
  PanelRight,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
  UserRound,
} from '@lucide/vue'
import { EmptyBlock, MetricCard, Panel, PreferenceRow, SettingsHeader, ToggleRow } from './shared'
import { formatCount, providerStateLabel } from './knowledgeDeskDisplay'
import { parseKnowledgeDeskBackup } from './knowledgeDeskApi'

const props = defineProps<SettingsPageProps>()

const snapshot = computed(() => props.snapshot)
const providers = computed(() => props.snapshot.modelProviders.filter((provider) => provider.providerType !== 'local_compatible'))
const profile = computed(() => props.snapshot.profile)
const folders = computed(() => props.managedSourceFolders)

const settingsTabs: Array<{ id: SettingsTab; label: string; icon: Component }> = [
  { id: 'profile', label: '账户', icon: UserRound },
  { id: 'models', label: '模型', icon: KeyRound },
  { id: 'ai', label: 'AI 偏好', icon: SlidersHorizontal },
  { id: 'privacy', label: '隐私', icon: Shield },
  { id: 'integrations', label: '导入集成', icon: Link2 },
]

const backupFileInputRef = ref<HTMLInputElement | null>(null)
const backupAction = ref<'export' | 'import' | null>(null)
const backupMessage = ref<string | null>(null)
const backupError = ref<string | null>(null)

const draft = ref<CloudModelDraft>({ ...initialCloudModelDraft })
const modelBusyAction = ref<string | null>(null)
const formError = ref<string | null>(null)
const modelActionMessage = ref<string | null>(null)

const isSaving = ref(false)
const preferenceError = ref<string | null>(null)

const integrationBusyAction = ref<string | null>(null)
const sourceError = ref<string | null>(null)

const dbConnectionValue = computed(() => (snapshot.value.status === 'ok' ? '已连接' : '未连接'))
const dbConnectionDetail = computed(() =>
  snapshot.value.status === 'ok' ? '正在读取本机知识库' : (snapshot.value.error ?? '后端未启动或认证不可用'),
)

const defaultModel = computed(() => {
  const verified = providers.value.filter((provider) => provider.lastCheckStatus === 'ok')
  const organization = verified.find((provider) => provider.id === profile.value.summaryModelSourceId)
    ?? verified.find((provider) => provider.id === profile.value.defaultModelSourceId)
    ?? verified.find((provider) => provider.isDefault)
    ?? verified[0]
  return organization
    ? `${organization.provider} / ${organization.model}`
    : '未配置云端模型 (无法进行 AI 整理)'
})

function isVerifiedProvider(provider: ModelProvider) {
  return provider.lastCheckStatus === 'ok'
}

function isOrganizationModel(provider: ModelProvider) {
  return (
    isVerifiedProvider(provider)
    && (profile.value.summaryModelSourceId === provider.id
      || (!profile.value.summaryModelSourceId && profile.value.defaultModelSourceId === provider.id))
  )
}

function isReferencedModel(provider: ModelProvider) {
  return [
    profile.value.defaultModelSourceId,
    profile.value.summaryModelSourceId,
    profile.value.taggingModelSourceId,
  ].includes(provider.id)
}

function isModelBusy(provider: ModelProvider) {
  return modelBusyAction.value?.endsWith(`:${provider.id}`) ?? false
}

function isFolderBusy(folder: ManagedSourceFolder) {
  return integrationBusyAction.value?.startsWith(`folder:${folder.id}`) ?? false
}

function applyDraftPreset(preset: Partial<CloudModelDraft>) {
  draft.value = { ...initialCloudModelDraft, ...preset }
}

async function exportBackup() {
  backupAction.value = 'export'
  backupMessage.value = null
  backupError.value = null
  try {
    const wasExported = await props.onExportBackup()
    backupMessage.value = wasExported ? '备份已生成；模型源和密钥没有写入文件。' : '已取消备份保存。'
  } catch (error) {
    backupError.value = error instanceof Error ? error.message : String(error)
  } finally {
    backupAction.value = null
  }
}

async function importDesktopBackup() {
  backupAction.value = 'import'
  backupMessage.value = null
  backupError.value = null
  try {
    const wasImported = await props.onPickDesktopBackup()
    backupMessage.value = wasImported ? '备份已完成合并；现有资料和模型配置保持不变。' : '已取消选择备份文件。'
  } catch (error) {
    backupError.value = error instanceof Error ? error.message : String(error)
  } finally {
    backupAction.value = null
  }
}

function handleImportClick() {
  if (props.canUseDesktopBackupPicker) {
    void importDesktopBackup()
  } else {
    backupFileInputRef.value?.click()
  }
}

async function importBrowserBackup(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  backupAction.value = 'import'
  backupMessage.value = null
  backupError.value = null
  try {
    const backup = parseKnowledgeDeskBackup(await file.text())
    await props.onImportBackup(backup)
    backupMessage.value = `已合并 ${file.name}；现有资料和模型配置保持不变。`
  } catch (error) {
    backupError.value = error instanceof Error ? error.message : String(error)
  } finally {
    backupAction.value = null
  }
}

async function submitCloudModel() {
  if (!draft.value.name.trim() || !draft.value.baseUrl.trim() || !draft.value.defaultModel.trim() || !draft.value.apiKey.trim()) {
    formError.value = '请填写云端模型名称、HTTPS Base URL、模型名和 API Key。'
    return
  }
  try {
    const url = new URL(draft.value.baseUrl.trim())
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
    if (url.protocol !== 'https:' || host === 'localhost' || host === '127.0.0.1' || host === '::1') {
      formError.value = '云端模型必须使用 HTTPS 公网地址，不能填写本机回环地址。'
      return
    }
  } catch {
    formError.value = '请输入有效的云端 HTTPS Base URL。'
    return
  }

  modelBusyAction.value = 'create'
  formError.value = null
  modelActionMessage.value = null
  try {
    await props.onCreateCloudModel(draft.value)
    draft.value = { ...initialCloudModelDraft, name: draft.value.name, baseUrl: draft.value.baseUrl, defaultModel: draft.value.defaultModel, apiKey: '' }
    modelActionMessage.value = '模型已通过测试，并已设为知识整理模型。'
  } catch (error) {
    formError.value = error instanceof Error ? error.message : String(error)
  } finally {
    modelBusyAction.value = null
  }
}

async function runProviderAction(provider: ModelProvider, action: 'test' | 'organize' | 'delete') {
  modelBusyAction.value = `${action}:${provider.id}`
  modelActionMessage.value = null
  try {
    let message: string
    if (action === 'delete') {
      const confirmed = window.confirm(`确定删除模型“${provider.provider}”吗？删除后需要重新配置 API Key 才能恢复。`)
      if (!confirmed) return
      await props.onDeleteModel(provider)
      message = `${provider.provider} 已删除。`
    } else if (action === 'test') {
      message = await props.onTestModel(provider)
    } else {
      await props.onUseForOrganization(provider)
      message = `${provider.provider} 已设为知识整理模型。`
    }
    modelActionMessage.value = message
  } catch (error) {
    modelActionMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    modelBusyAction.value = null
  }
}

async function changeOrganizeMode(checked: boolean) {
  isSaving.value = true
  preferenceError.value = null
  try {
    await props.onOrganizeModeChange(checked ? 'auto' : 'manual')
  } catch (error) {
    preferenceError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isSaving.value = false
  }
}

async function runSourceAction(action: string, callback: () => Promise<void>) {
  integrationBusyAction.value = action
  sourceError.value = null
  try {
    await callback()
  } catch (error) {
    sourceError.value = error instanceof Error ? error.message : String(error)
  } finally {
    integrationBusyAction.value = null
  }
}

function sourceFolderStatusLabel(folder: ManagedSourceFolder) {
  if (!folder.enabled || folder.status === 'paused') return '已暂停'
  if (folder.status === 'scanning') return '扫描中'
  if (folder.status === 'error') return '需要处理'
  if (folder.status === 'watching') return '正在监听'
  return '状态同步中'
}

function sourceFolderLastScan(value?: string | null) {
  if (!value) return '尚未扫描'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '尚未扫描' : `最近扫描 ${date.toLocaleString()}`
}
</script>

<template>
  <div class="kd-settings">
    <aside class="kd-settings-nav">
      <button
        v-for="tab in settingsTabs"
        :key="tab.id"
        :class="activeTab === tab.id ? 'is-active' : ''"
        type="button"
        @click="onTabChange(tab.id)"
      >
        <component :is="tab.icon" :size="17" />
        {{ tab.label }}
      </button>
    </aside>

    <section class="kd-settings-content">
      <header class="kd-settings-index">
        <p>LOCAL CONTROL / SETTINGS</p>
        <span>05</span>
      </header>

      <section v-if="activeTab === 'profile'" class="kd-stack">
        <SettingsHeader title="账户信息" description="管理身份、设备状态、同步状态、存储占用和本机数据备份。" />
        <section class="kd-profile-band">
          <div class="kd-profile-avatar">{{ snapshot.profile.displayName.slice(0, 1) || '泽' }}</div>
          <div>
            <h2>{{ snapshot.profile.displayName }}</h2>
            <p>{{ snapshot.profile.email }}</p>
            <div class="kd-inline-status">
              <span><HardDrive :size="15" /> MacBook Pro 本地在线</span>
              <span><Cloud :size="15" /> {{ snapshot.status === 'ok' ? '本机数据库同步正常' : '未连接数据库' }}</span>
            </div>
          </div>
        </section>
        <section class="kd-settings-grid">
          <MetricCard label="知识条目" :value="formatCount(snapshot.storage.totalItems)" :detail="`${snapshot.storage.archivedItems} 条已归档`" />
          <MetricCard label="本地索引" :value="formatCount(snapshot.storage.readyItems)" :detail="`${snapshot.storage.inboxItems} 条仍在收集箱`" />
          <MetricCard label="标签资产" :value="formatCount(snapshot.storage.totalTags)" :detail="`${snapshot.storage.totalModelSources} 个模型源可用`" />
          <MetricCard label="数据库连接" :value="dbConnectionValue" :detail="dbConnectionDetail" />
        </section>
        <section class="kd-backup-card" aria-labelledby="knowledge-desk-backup-title">
          <div>
            <h3 id="knowledge-desk-backup-title">本机数据备份</h3>
            <p>导出只包含知识条目、标签和非敏感偏好；不会导出 API Key、登录信息或模型源。导入只合并新增资料，不删除或覆盖现有内容，目标机器需要重新配置云端模型。</p>
          </div>
          <div class="kd-settings-actions kd-backup-actions">
            <button :disabled="backupAction !== null" type="button" @click="exportBackup">
              <Loader2 v-if="backupAction === 'export'" :size="15" />
              <Download v-else :size="15" />
              导出 JSON 备份
            </button>
            <button :disabled="backupAction !== null" type="button" @click="handleImportClick">
              <Loader2 v-if="backupAction === 'import'" :size="15" />
              <Upload v-else :size="15" />
              导入并合并备份
            </button>
            <input ref="backupFileInputRef" accept="application/json,.json" class="kd-hidden-file-input" type="file" @change="importBrowserBackup" />
          </div>
          <p v-if="backupMessage" class="kd-text-muted" role="status">{{ backupMessage }}</p>
          <p v-if="backupError" class="kd-form-error" role="alert">{{ backupError }}</p>
        </section>
      </section>

      <section v-if="activeTab === 'models'" class="kd-stack">
        <SettingsHeader title="云端模型 API 配置" description="仅支持接入云端大模型（DeepSeek、OpenAI），API Key 将加密安全存储。" />
        <div class="kd-model-grid">
          <article v-for="provider in providers" :key="provider.id" class="kd-model-card">
            <div class="kd-model-card-head">
              <strong>{{ provider.provider }}</strong>
              <span :class="`kd-provider-state kd-provider-state--${provider.state}`">{{ providerStateLabel(provider) }}</span>
            </div>
            <dl>
              <dt>接口地址</dt>
              <dd>{{ provider.baseUrl }}</dd>
              <dt>密钥状态</dt>
              <dd>{{ provider.keyState }}</dd>
              <dt>模型名称</dt>
              <dd>{{ provider.model }}</dd>
            </dl>
            <p v-if="provider.lastCheckMessage" class="kd-text-muted">最近测试：{{ provider.lastCheckMessage }}</p>
            <div class="kd-model-actions">
              <button :disabled="isModelBusy(provider) || !provider.enabled" type="button" @click="runProviderAction(provider, 'test')">
                <Loader2 v-if="modelBusyAction === `test:${provider.id}`" :size="15" />
                <KeyRound v-else :size="15" />
                测试连通
              </button>
              <button
                :disabled="isModelBusy(provider) || !isVerifiedProvider(provider) || isOrganizationModel(provider)"
                type="button"
                @click="runProviderAction(provider, 'organize')"
              >
                {{ isOrganizationModel(provider) ? '当前整理模型' : '设为整理模型' }}
              </button>
              <button
                class="danger"
                :disabled="isModelBusy(provider) || isReferencedModel(provider)"
                :title="isReferencedModel(provider) ? '请先切换整理模型后再删除' : '删除模型配置'"
                type="button"
                @click="runProviderAction(provider, 'delete')"
              >
                <Loader2 v-if="modelBusyAction === `delete:${provider.id}`" :size="15" />
                <Trash2 v-else :size="15" />
                {{ isReferencedModel(provider) ? '当前使用中' : '删除' }}
              </button>
            </div>
          </article>
          <form class="kd-model-card kd-cloud-model-form" @submit.prevent="submitCloudModel">
            <div class="kd-model-card-head">
              <strong>接入大模型 API</strong>
              <Plus :size="17" />
            </div>
            <div style="display: flex; gap: 6px; margin-bottom: 8px">
              <button type="button" class="kd-btn-subtle" style="font-size: 11px; padding: 2px 8px" @click="applyDraftPreset({ name: 'DeepSeek 官方', baseUrl: 'https://api.deepseek.com/v1', defaultModel: 'deepseek-flash' })">
                DeepSeek
              </button>
              <button type="button" class="kd-btn-subtle" style="font-size: 11px; padding: 2px 8px" @click="applyDraftPreset({ name: 'OpenAI 官方', baseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-4o-mini' })">
                OpenAI
              </button>
            </div>
            <label class="kd-field">
              <span>名称</span>
              <input v-model="draft.name" />
            </label>
            <label class="kd-field">
              <span>云端 API 接口地址 (Base URL)</span>
              <input v-model="draft.baseUrl" placeholder="例如 https://api.deepseek.com/v1" />
            </label>
            <label class="kd-field">
              <span>模型名称 (Model Name)</span>
              <input v-model="draft.defaultModel" placeholder="例如 deepseek-flash 或 gpt-4o-mini" />
            </label>
            <label class="kd-field">
              <span>云端 API Key (密钥将安全加密入库)</span>
              <input v-model="draft.apiKey" type="password" placeholder="sk-••••••••••••••••" />
            </label>
            <div v-if="formError" class="kd-form-error">{{ formError }}</div>
            <div class="kd-model-actions">
              <button :disabled="modelBusyAction === 'create'" type="submit">
                <Loader2 v-if="modelBusyAction === 'create'" :size="15" />
                <Plus v-else :size="15" />
                保存并测试模型
              </button>
            </div>
          </form>
          <EmptyBlock
            v-if="providers.length === 0"
            :icon="KeyRound"
            title="尚未配置大模型 API"
            description="填写并测试云端 DeepSeek / OpenAI 配置后，才能进行真实的知识整理与问答。"
          />
        </div>
        <p v-if="modelActionMessage" class="kd-text-muted">{{ modelActionMessage }}</p>
      </section>

      <section v-if="activeTab === 'ai'" class="kd-stack">
        <SettingsHeader title="AI 整理偏好" description="摘要和标签只由已通过连通性测试的云端 DeepSeek / OpenAI 模型生成。" />
        <section class="kd-preference-list">
          <PreferenceRow label="知识整理模型" :value="defaultModel" />
          <PreferenceRow label="摘要和标签" value="大模型一次请求生成" />
          <PreferenceRow label="模型失败处理" value="标记整理失败，不生成规则标签" />
        </section>
        <section class="kd-settings-split">
          <Panel title="响应偏好" :icon="Sparkles">
            <p class="kd-text-muted">当前专注资料整理；检索问答会在检索与引用链路完成后接入。</p>
          </Panel>
          <Panel title="整理策略" :icon="PanelRight">
            <ToggleRow :disabled="isSaving" label="导入后自动整理" :checked="profile.organizeMode === 'auto'" :on-change="changeOrganizeMode" />
            <p v-if="preferenceError" class="kd-text-muted">{{ preferenceError }}</p>
          </Panel>
        </section>
      </section>

      <section v-if="activeTab === 'privacy'" class="kd-stack">
        <SettingsHeader title="隐私与数据控制" description="API 密钥均经由 AES-GCM 加密存储于本地数据库，不会明文泄露。" />
        <section class="kd-preference-list">
          <PreferenceRow label="当前偏好" :value="profile.privacyMode === 'cloud_first' ? '云端优先' : '本地优先'" />
          <PreferenceRow label="模型调用边界" value="仅向用户主动配置并测试通过的 API 发起请求" />
          <PreferenceRow label="模型失败处理" value="标记整理失败，不生成规则标签" />
        </section>
        <section class="kd-danger-zone">
          <AlertTriangle :size="18" />
          <div>
            <strong>数据清理</strong>
            <p>删除缓存、重建索引和清理知识库前应先导出备份。</p>
          </div>
        </section>
      </section>

      <section v-if="activeTab === 'integrations'" class="kd-stack">
        <SettingsHeader title="导入与集成设置" description="本机资料夹只在桌面主进程中监听；目录路径、内容哈希和受管原件位置不会显示在界面。" />
        <section class="kd-preference-list">
          <PreferenceRow label="浏览器摘录来源" value="通过“网页摘录”手动收集" />
          <PreferenceRow label="Markdown 解析" value="保留标题层级、代码块和 frontmatter" />
          <PreferenceRow label="PDF 解析" value="章节识别 + 引用保留 + 图片占位" />
          <PreferenceRow label="默认标签策略" value="主题标签 3 个 + 来源标签 1 个" />
          <PreferenceRow label="导入后整理" value="由 AI 整理偏好控制" />
        </section>

        <section class="kd-managed-sources" aria-label="本机资料源">
          <div class="kd-managed-sources__header">
            <div>
              <p class="kd-kicker">本机资料源</p>
              <h3>自动收集资料夹</h3>
              <p>最多 5 个非递归目录；稳定文件会按现有哈希规则导入，原目录不会被移动或删除。</p>
            </div>
            <button :disabled="!canUseManagedSourceFolders || integrationBusyAction !== null" type="button" @click="runSourceAction('add', onAddManagedSourceFolder)">
              <Loader2 v-if="integrationBusyAction === 'add'" class="animate-spin" :size="15" />
              <Plus v-else :size="15" />
              添加资料夹
            </button>
          </div>
          <div v-if="!canUseManagedSourceFolders" class="kd-managed-sources__notice">
            <FolderOpen :size="18" /> 本机资料夹监听仅在桌面端可用；浏览器预览不会保存路径或模拟监听状态。
          </div>
          <EmptyBlock
            v-if="canUseManagedSourceFolders && folders.length === 0"
            :icon="FolderOpen"
            title="还没有自动收集资料夹"
            description="选择一个常用资料目录后，新加入且稳定的 Markdown、PDF、TXT、HTML、DOCX 或 PPTX 文件会进入收集箱。"
          />
          <article v-for="folder in folders" :key="folder.id" class="kd-managed-source-card">
            <div class="kd-managed-source-card__title">
              <span :class="`kd-managed-source-status kd-managed-source-status--${folder.status}`" />
              <div>
                <strong>{{ folder.label }}</strong>
                <p>{{ sourceFolderStatusLabel(folder) }} · {{ sourceFolderLastScan(folder.lastScanAt) }}</p>
              </div>
            </div>
            <div class="kd-managed-source-card__stats" :aria-label="`${folder.label} 导入统计`">
              <span>等待 {{ formatCount(folder.counts.waiting) }}</span>
              <span>导入 {{ formatCount(folder.counts.imported) }}</span>
              <span>跳过 {{ formatCount(folder.counts.skipped) }}</span>
              <span v-if="folder.counts.failed > 0">失败 {{ formatCount(folder.counts.failed) }}</span>
            </div>
            <div class="kd-managed-source-card__actions">
              <button :disabled="isFolderBusy(folder)" type="button" @click="runSourceAction(`folder:${folder.id}:scan`, () => onScanManagedSourceFolder(folder.id))">
                <RefreshCw :class="integrationBusyAction === `folder:${folder.id}:scan` ? 'animate-spin' : ''" :size="14" /> 立即扫描
              </button>
              <button :disabled="isFolderBusy(folder)" type="button" @click="runSourceAction(`folder:${folder.id}:enabled`, () => onSetManagedSourceFolderEnabled(folder.id, !folder.enabled))">
                <Pause v-if="folder.enabled" :size="14" />
                <Play v-else :size="14" /> {{ folder.enabled ? '暂停' : '继续' }}
              </button>
              <button class="is-danger" :disabled="isFolderBusy(folder)" type="button" @click="runSourceAction(`folder:${folder.id}:remove`, () => onRemoveManagedSourceFolder(folder.id))">
                <Trash2 :size="14" /> 移除
              </button>
            </div>
          </article>
          <p v-if="sourceError" class="kd-form-error">{{ sourceError }}</p>
        </section>
      </section>
    </section>
  </div>
</template>
