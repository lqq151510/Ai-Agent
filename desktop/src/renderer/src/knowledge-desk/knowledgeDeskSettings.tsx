import { useRef, useState, type ChangeEvent, type ElementType, type FormEvent } from 'react';
import { AlertTriangle, Cloud, Download, FolderOpen, HardDrive, KeyRound, Link2, Loader2, PanelRight, Pause, Play, Plus, RefreshCw, Shield, SlidersHorizontal, Sparkles, Trash2, Upload, UserRound } from 'lucide-react';
import { parseKnowledgeDeskBackup, type KnowledgeDeskBackup, type KnowledgeDeskSnapshot, type ManagedSourceFolder, type ModelProvider } from './knowledgeDeskApi';
import type { SettingsTab } from './knowledgeDeskTypes';
import { EmptyBlock, MetricCard, Panel, PreferenceRow, SettingsHeader, ToggleRow } from './knowledgeDeskShared';
import { formatCount, providerStateLabel } from './knowledgeDeskDisplay';

const settingsTabs: Array<{ id: SettingsTab; label: string; icon: ElementType }> = [
  { id: 'profile', label: '账户', icon: UserRound },
  { id: 'models', label: '模型', icon: KeyRound },
  { id: 'ai', label: 'AI 偏好', icon: SlidersHorizontal },
  { id: 'privacy', label: '隐私', icon: Shield },
  { id: 'integrations', label: '导入集成', icon: Link2 },
];

type LocalModelDraft = {
  name: string;
  baseUrl: string;
  defaultModel: string;
  apiKey: string;
};

const initialLocalModelDraft: LocalModelDraft = {
  name: '本机聊天模型',
  baseUrl: 'http://127.0.0.1:11434/v1',
  defaultModel: '',
  apiKey: '',
};

export const SettingsPage = ({
  activeTab,
  canUseDesktopBackupPicker,
  canUseManagedSourceFolders,
  managedSourceFolders,
  onTabChange,
  snapshot,
  onCreateLocalModel,
  onExportBackup,
  onImportBackup,
  onPickDesktopBackup,
  onTestModel,
  onUseForOrganization,
  onOrganizeModeChange,
  onAddManagedSourceFolder,
  onRemoveManagedSourceFolder,
  onScanManagedSourceFolder,
  onSetManagedSourceFolderEnabled,
}: {
  activeTab: SettingsTab;
  canUseDesktopBackupPicker: boolean;
  canUseManagedSourceFolders: boolean;
  managedSourceFolders: ManagedSourceFolder[];
  onTabChange: (tab: SettingsTab) => void;
  snapshot: KnowledgeDeskSnapshot;
  onCreateLocalModel: (draft: LocalModelDraft) => Promise<void>;
  onExportBackup: () => Promise<boolean>;
  onImportBackup: (backup: KnowledgeDeskBackup) => Promise<void>;
  onPickDesktopBackup: () => Promise<boolean>;
  onTestModel: (provider: ModelProvider) => Promise<string>;
  onUseForOrganization: (provider: ModelProvider) => Promise<void>;
  onOrganizeModeChange: (mode: 'manual' | 'auto') => Promise<void>;
  onAddManagedSourceFolder: () => Promise<void>;
  onRemoveManagedSourceFolder: (folderId: string) => Promise<void>;
  onScanManagedSourceFolder: (folderId: string) => Promise<void>;
  onSetManagedSourceFolderEnabled: (folderId: string, enabled: boolean) => Promise<void>;
}) => (
  <div className="kd-settings">
    <aside className="kd-settings-nav">
      {settingsTabs.map((tab) => {
        const Icon = tab.icon;
        return (
          <button
            className={activeTab === tab.id ? 'is-active' : ''}
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            type="button"
          >
            <Icon size={17} />
            {tab.label}
          </button>
        );
      })}
    </aside>
    <section className="kd-settings-content">
      <header className="kd-settings-index">
        <p>LOCAL CONTROL / SETTINGS</p>
        <span>05</span>
      </header>
      {activeTab === 'profile' ? (
        <ProfileSettings
          canUseDesktopBackupPicker={canUseDesktopBackupPicker}
          onExportBackup={onExportBackup}
          onImportBackup={onImportBackup}
          onPickDesktopBackup={onPickDesktopBackup}
          snapshot={snapshot}
        />
      ) : null}
      {activeTab === 'models' ? (
        <ModelSettings
          onCreateLocalModel={onCreateLocalModel}
          onTestModel={onTestModel}
          onUseForOrganization={onUseForOrganization}
          profile={snapshot.profile}
          providers={snapshot.modelProviders}
        />
      ) : null}
      {activeTab === 'ai' ? (
        <AiPreferenceSettings
          onOrganizeModeChange={onOrganizeModeChange}
          profile={snapshot.profile}
          providers={snapshot.modelProviders}
        />
      ) : null}
      {activeTab === 'privacy' ? <PrivacySettings privacyMode={snapshot.profile.privacyMode} /> : null}
      {activeTab === 'integrations' ? (
        <IntegrationSettings
          canUseManagedSourceFolders={canUseManagedSourceFolders}
          folders={managedSourceFolders}
          onAddFolder={onAddManagedSourceFolder}
          onRemoveFolder={onRemoveManagedSourceFolder}
          onScanFolder={onScanManagedSourceFolder}
          onSetFolderEnabled={onSetManagedSourceFolderEnabled}
        />
      ) : null}
    </section>
  </div>
);

const ProfileSettings = ({
  canUseDesktopBackupPicker,
  onExportBackup,
  onImportBackup,
  onPickDesktopBackup,
  snapshot,
}: {
  canUseDesktopBackupPicker: boolean;
  onExportBackup: () => Promise<boolean>;
  onImportBackup: (backup: KnowledgeDeskBackup) => Promise<void>;
  onPickDesktopBackup: () => Promise<boolean>;
  snapshot: KnowledgeDeskSnapshot;
}) => {
  const backupFileInputRef = useRef<HTMLInputElement>(null);
  const [backupAction, setBackupAction] = useState<'export' | 'import' | null>(null);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);

  const exportBackup = async () => {
    setBackupAction('export');
    setBackupMessage(null);
    setBackupError(null);
    try {
      const wasExported = await onExportBackup();
      setBackupMessage(wasExported ? '备份已生成；模型源和密钥没有写入文件。' : '已取消备份保存。');
    } catch (error) {
      setBackupError(error instanceof Error ? error.message : String(error));
    } finally {
      setBackupAction(null);
    }
  };

  const importDesktopBackup = async () => {
    setBackupAction('import');
    setBackupMessage(null);
    setBackupError(null);
    try {
      const wasImported = await onPickDesktopBackup();
      setBackupMessage(wasImported ? '备份已完成合并；现有资料和模型配置保持不变。' : '已取消选择备份文件。');
    } catch (error) {
      setBackupError(error instanceof Error ? error.message : String(error));
    } finally {
      setBackupAction(null);
    }
  };

  const importBrowserBackup = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setBackupAction('import');
    setBackupMessage(null);
    setBackupError(null);
    try {
      const backup = parseKnowledgeDeskBackup(await file.text());
      await onImportBackup(backup);
      setBackupMessage(`已合并 ${file.name}；现有资料和模型配置保持不变。`);
    } catch (error) {
      setBackupError(error instanceof Error ? error.message : String(error));
    } finally {
      setBackupAction(null);
    }
  };

  return (
    <div className="kd-stack">
      <SettingsHeader title="账户信息" description="管理身份、设备状态、同步状态、存储占用和本机数据备份。" />
      <section className="kd-profile-band">
        <div className="kd-profile-avatar">{snapshot.profile.displayName.slice(0, 1) || '泽'}</div>
        <div>
          <h2>{snapshot.profile.displayName}</h2>
          <p>{snapshot.profile.email}</p>
          <div className="kd-inline-status">
            <span><HardDrive size={15} /> MacBook Pro 本地在线</span>
            <span><Cloud size={15} /> {snapshot.status === 'ok' ? '本机数据库同步正常' : '未连接数据库'}</span>
          </div>
        </div>
      </section>
      <section className="kd-settings-grid">
        <MetricCard label="知识条目" value={formatCount(snapshot.storage.totalItems)} detail={`${snapshot.storage.archivedItems} 条已归档`} />
        <MetricCard label="本地索引" value={formatCount(snapshot.storage.readyItems)} detail={`${snapshot.storage.inboxItems} 条仍在收集箱`} />
        <MetricCard label="标签资产" value={formatCount(snapshot.storage.totalTags)} detail={`${snapshot.storage.totalModelSources} 个模型源可用`} />
        <MetricCard
          label="数据库连接"
          value={snapshot.status === 'ok' ? '已连接' : '未连接'}
          detail={snapshot.status === 'ok' ? '正在读取本机知识库' : snapshot.error ?? '后端未启动或认证不可用'}
        />
      </section>
      <section className="kd-backup-card" aria-labelledby="knowledge-desk-backup-title">
        <div>
          <h3 id="knowledge-desk-backup-title">本机数据备份</h3>
          <p>导出只包含知识条目、标签和非敏感偏好；不会导出 API Key、登录信息或模型源。导入只合并新增资料，不删除或覆盖现有内容，目标机器需要重新配置本机模型。</p>
        </div>
        <div className="kd-settings-actions kd-backup-actions">
          <button disabled={backupAction !== null} onClick={() => void exportBackup()} type="button">
            {backupAction === 'export' ? <Loader2 size={15} /> : <Download size={15} />}
            导出 JSON 备份
          </button>
          <button
            disabled={backupAction !== null}
            onClick={() => {
              if (canUseDesktopBackupPicker) {
                void importDesktopBackup();
              } else {
                backupFileInputRef.current?.click();
              }
            }}
            type="button"
          >
            {backupAction === 'import' ? <Loader2 size={15} /> : <Upload size={15} />}
            导入并合并备份
          </button>
          <input accept="application/json,.json" className="kd-hidden-file-input" onChange={(event) => void importBrowserBackup(event)} ref={backupFileInputRef} type="file" />
        </div>
        {backupMessage ? <p className="kd-text-muted" role="status">{backupMessage}</p> : null}
        {backupError ? <p className="kd-form-error" role="alert">{backupError}</p> : null}
      </section>
    </div>
  );
};

const ModelSettings = ({
  providers,
  profile,
  onCreateLocalModel,
  onTestModel,
  onUseForOrganization,
}: {
  providers: ModelProvider[];
  profile: KnowledgeDeskSnapshot['profile'];
  onCreateLocalModel: (draft: LocalModelDraft) => Promise<void>;
  onTestModel: (provider: ModelProvider) => Promise<string>;
  onUseForOrganization: (provider: ModelProvider) => Promise<void>;
}) => {
  const [draft, setDraft] = useState<LocalModelDraft>(initialLocalModelDraft);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const submitLocalModel = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft.name.trim() || !draft.baseUrl.trim() || !draft.defaultModel.trim()) {
      setFormError('请填写名称、回环接口地址和聊天模型名。');
      return;
    }

    setBusyAction('create');
    setFormError(null);
    setActionMessage(null);
    try {
      await onCreateLocalModel(draft);
      setDraft((current) => ({ ...current, defaultModel: '', apiKey: '' }));
      setActionMessage('本机模型已通过测试，并已设为知识整理模型。');
    } catch (error) {
      setFormError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyAction(null);
    }
  };

  const runProviderAction = async (
    provider: ModelProvider,
    action: 'test' | 'organize',
  ) => {
    setBusyAction(`${action}:${provider.id}`);
    setActionMessage(null);
    try {
      let message: string;
      if (action === 'test') {
        message = await onTestModel(provider);
      } else {
        await onUseForOrganization(provider);
        message = `${provider.provider} 已设为知识整理模型。`;
      }
      setActionMessage(message);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="kd-stack">
      <SettingsHeader title="本机模型配置" description="知识正文只会发送给本机回环地址（localhost / 127.0.0.1 / ::1）的 OpenAI-compatible 聊天模型。" />
      <div className="kd-model-grid">
        {providers.map((provider) => {
          const isLocalProvider = provider.providerType === 'local_compatible';
          const isVerifiedLocalProvider = isLocalProvider && provider.lastCheckStatus === 'ok';
          const isOrganizationModel = isVerifiedLocalProvider && (profile.summaryModelSourceId === provider.id || (
            !profile.summaryModelSourceId && profile.defaultModelSourceId === provider.id
          ));
          const isBusy = busyAction?.endsWith(`:${provider.id}`) ?? false;
          return (
            <article className="kd-model-card" key={provider.id}>
              <div className="kd-model-card-head">
                <strong>{provider.provider}</strong>
                <span className={`kd-provider-state kd-provider-state--${provider.state}`}>{providerStateLabel(provider)}</span>
              </div>
              <dl>
                <dt>接口地址</dt>
                <dd>{provider.baseUrl}</dd>
                <dt>密钥状态</dt>
                <dd>{provider.keyState}</dd>
                <dt>聊天模型</dt>
                <dd>{provider.model}</dd>
              </dl>
              {provider.lastCheckMessage ? <p className="kd-text-muted">最近测试：{provider.lastCheckMessage}</p> : null}
              <div className="kd-model-actions">
                <button disabled={isBusy || !provider.enabled || !isLocalProvider} onClick={() => void runProviderAction(provider, 'test')} type="button">
                  {busyAction === `test:${provider.id}` ? <Loader2 size={15} /> : <KeyRound size={15} />}
                  {isLocalProvider ? '测试模型' : '仅展示'}
                </button>
                <button disabled={isBusy || !isVerifiedLocalProvider || isOrganizationModel} onClick={() => void runProviderAction(provider, 'organize')} type="button">
                  {isOrganizationModel ? '当前整理模型' : isLocalProvider ? '用于整理' : '不可用于本机整理'}
                </button>
              </div>
            </article>
          );
        })}
        <form className="kd-model-card kd-local-model-form" onSubmit={(event) => void submitLocalModel(event)}>
          <div className="kd-model-card-head">
            <strong>添加本机聊天模型</strong>
            <Plus size={17} />
          </div>
          <label className="kd-field">
            <span>名称</span>
            <input onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} value={draft.name} />
          </label>
          <label className="kd-field">
            <span>OpenAI-compatible 回环地址</span>
            <input onChange={(event) => setDraft((current) => ({ ...current, baseUrl: event.target.value }))} placeholder="http://127.0.0.1:11434/v1" value={draft.baseUrl} />
          </label>
          <label className="kd-field">
            <span>聊天模型名</span>
            <input onChange={(event) => setDraft((current) => ({ ...current, defaultModel: event.target.value }))} placeholder="例如 qwen3.5:9b" value={draft.defaultModel} />
          </label>
          <label className="kd-field">
            <span>API Key（多数本机服务可留空）</span>
            <input onChange={(event) => setDraft((current) => ({ ...current, apiKey: event.target.value }))} placeholder="留空将使用本机占位密钥" type="password" value={draft.apiKey} />
          </label>
          {formError ? <div className="kd-form-error">{formError}</div> : null}
          <div className="kd-model-actions">
            <button disabled={busyAction === 'create'} type="submit">
              {busyAction === 'create' ? <Loader2 size={15} /> : <Plus size={15} />}
              保存、测试并设为整理模型
            </button>
          </div>
        </form>
        {providers.length === 0 ? (
          <EmptyBlock
            icon={KeyRound}
            title="尚未配置本机聊天模型"
            description="填写本机 OpenAI-compatible 服务和聊天模型名后，先测试，再用于整理资料。"
          />
        ) : null}
      </div>
      {actionMessage ? <p className="kd-text-muted">{actionMessage}</p> : null}
    </div>
  );
};

const AiPreferenceSettings = ({
  providers,
  profile,
  onOrganizeModeChange,
}: {
  providers: ModelProvider[];
  profile: KnowledgeDeskSnapshot['profile'];
  onOrganizeModeChange: (mode: 'manual' | 'auto') => Promise<void>;
}) => {
  const verifiedLocalProviders = providers.filter(
    (provider) => provider.providerType === 'local_compatible' && provider.lastCheckStatus === 'ok',
  );
  const organizationProvider = verifiedLocalProviders.find((provider) => provider.id === profile.summaryModelSourceId)
    ?? verifiedLocalProviders.find((provider) => provider.id === profile.defaultModelSourceId)
    ?? verifiedLocalProviders.find((provider) => provider.isDefault)
    ?? verifiedLocalProviders[0];
  const defaultModel = organizationProvider ? `${organizationProvider.provider} / ${organizationProvider.model}` : '未配置本机模型';
  const [isSaving, setIsSaving] = useState(false);
  const [preferenceError, setPreferenceError] = useState<string | null>(null);

  const changeOrganizeMode = async (checked: boolean) => {
    setIsSaving(true);
    setPreferenceError(null);
    try {
      await onOrganizeModeChange(checked ? 'auto' : 'manual');
    } catch (error) {
      setPreferenceError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="kd-stack">
      <SettingsHeader title="AI 整理偏好" description="摘要和标签来自同一个已测试的本机聊天模型；未配置或调用失败时会保留规则整理，不会外发正文。" />
      <section className="kd-preference-list">
        <PreferenceRow label="知识整理模型" value={defaultModel} />
        <PreferenceRow label="摘要和标签" value="一次本机模型请求生成" />
        <PreferenceRow label="模型失败回退" value="本地规则整理" />
      </section>
      <section className="kd-settings-split">
        <Panel title="响应偏好" icon={Sparkles}>
          <p className="kd-text-muted">当前专注资料整理；检索问答会在检索与引用链路完成后接入。</p>
        </Panel>
        <Panel title="整理策略" icon={PanelRight}>
          <ToggleRow disabled={isSaving} label="导入后自动整理" checked={profile.organizeMode === 'auto'} onChange={(checked) => void changeOrganizeMode(checked)} />
          {preferenceError ? <p className="kd-text-muted">{preferenceError}</p> : null}
        </Panel>
      </section>
    </div>
  );
};

const PrivacySettings = ({ privacyMode }: { privacyMode: string }) => (
  <div className="kd-stack">
    <SettingsHeader title="隐私与数据控制" description="Knowledge Desk 的整理链路只会调用已经保存的本机回环模型，不会自动回退到云端模型。" />
    <section className="kd-preference-list">
      <PreferenceRow label="当前偏好" value={privacyMode === 'cloud_first' ? '云端优先（整理链路仍保持本机）' : '本机优先'} />
      <PreferenceRow label="整理内容边界" value="仅 localhost / 127.0.0.1 / ::1" />
      <PreferenceRow label="模型失败处理" value="不上传正文，回退本地规则" />
    </section>
    <section className="kd-danger-zone">
      <AlertTriangle size={18} />
      <div>
        <strong>数据清理</strong>
        <p>删除缓存、重建索引和清理知识库前应先导出备份。</p>
      </div>
    </section>
  </div>
);

const sourceFolderStatusLabel = (folder: ManagedSourceFolder) => {
  if (!folder.enabled || folder.status === 'paused') return '已暂停';
  if (folder.status === 'scanning') return '扫描中';
  if (folder.status === 'error') return '需要处理';
  if (folder.status === 'watching') return '正在监听';
  return '状态同步中';
};

const sourceFolderLastScan = (value?: string | null) => {
  if (!value) return '尚未扫描';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '尚未扫描' : `最近扫描 ${date.toLocaleString()}`;
};

const IntegrationSettings = ({
  canUseManagedSourceFolders,
  folders,
  onAddFolder,
  onRemoveFolder,
  onScanFolder,
  onSetFolderEnabled,
}: {
  canUseManagedSourceFolders: boolean;
  folders: ManagedSourceFolder[];
  onAddFolder: () => Promise<void>;
  onRemoveFolder: (folderId: string) => Promise<void>;
  onScanFolder: (folderId: string) => Promise<void>;
  onSetFolderEnabled: (folderId: string, enabled: boolean) => Promise<void>;
}) => {
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const run = async (action: string, callback: () => Promise<void>) => {
    setBusyAction(action);
    setSourceError(null);
    try {
      await callback();
    } catch (error) {
      setSourceError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="kd-stack">
      <SettingsHeader title="导入与集成设置" description="本机资料夹只在桌面主进程中监听；目录路径、内容哈希和受管原件位置不会显示在界面。" />
      <section className="kd-preference-list">
        <PreferenceRow label="浏览器摘录来源" value="通过“网页摘录”手动收集" />
        <PreferenceRow label="Markdown 解析" value="保留标题层级、代码块和 frontmatter" />
        <PreferenceRow label="PDF 解析" value="章节识别 + 引用保留 + 图片占位" />
        <PreferenceRow label="默认标签策略" value="主题标签 3 个 + 来源标签 1 个" />
        <PreferenceRow label="导入后整理" value="由 AI 整理偏好控制" />
      </section>

      <section className="kd-managed-sources" aria-label="本机资料源">
        <div className="kd-managed-sources__header">
          <div>
            <p className="kd-kicker">本机资料源</p>
            <h3>自动收集资料夹</h3>
            <p>最多 5 个非递归目录；稳定文件会按现有哈希规则导入，原目录不会被移动或删除。</p>
          </div>
          <button disabled={!canUseManagedSourceFolders || busyAction !== null} onClick={() => void run('add', onAddFolder)} type="button">
            {busyAction === 'add' ? <Loader2 className="animate-spin" size={15} /> : <Plus size={15} />}
            添加资料夹
          </button>
        </div>
        {!canUseManagedSourceFolders ? (
          <div className="kd-managed-sources__notice">
            <FolderOpen size={18} /> 本机资料夹监听仅在桌面端可用；浏览器预览不会保存路径或模拟监听状态。
          </div>
        ) : null}
        {canUseManagedSourceFolders && folders.length === 0 ? (
          <EmptyBlock
            icon={FolderOpen}
            title="还没有自动收集资料夹"
            description="选择一个常用资料目录后，新加入且稳定的 Markdown、PDF、TXT、HTML、DOCX 或 PPTX 文件会进入收集箱。"
          />
        ) : null}
        {folders.map((folder) => {
          const actionPrefix = `folder:${folder.id}`;
          const isBusy = busyAction?.startsWith(actionPrefix) ?? false;
          return (
            <article className="kd-managed-source-card" key={folder.id}>
              <div className="kd-managed-source-card__title">
                <span className={`kd-managed-source-status kd-managed-source-status--${folder.status}`} />
                <div>
                  <strong>{folder.label}</strong>
                  <p>{sourceFolderStatusLabel(folder)} · {sourceFolderLastScan(folder.lastScanAt)}</p>
                </div>
              </div>
              <div className="kd-managed-source-card__stats" aria-label={`${folder.label} 导入统计`}>
                <span>等待 {formatCount(folder.counts.waiting)}</span>
                <span>导入 {formatCount(folder.counts.imported)}</span>
                <span>跳过 {formatCount(folder.counts.skipped)}</span>
                {folder.counts.failed > 0 ? <span>失败 {formatCount(folder.counts.failed)}</span> : null}
              </div>
              <div className="kd-managed-source-card__actions">
                <button disabled={isBusy} onClick={() => void run(`${actionPrefix}:scan`, () => onScanFolder(folder.id))} type="button">
                  <RefreshCw className={busyAction === `${actionPrefix}:scan` ? 'animate-spin' : undefined} size={14} /> 立即扫描
                </button>
                <button disabled={isBusy} onClick={() => void run(`${actionPrefix}:enabled`, () => onSetFolderEnabled(folder.id, !folder.enabled))} type="button">
                  {folder.enabled ? <Pause size={14} /> : <Play size={14} />} {folder.enabled ? '暂停' : '继续'}
                </button>
                <button className="is-danger" disabled={isBusy} onClick={() => void run(`${actionPrefix}:remove`, () => onRemoveFolder(folder.id))} type="button">
                  <Trash2 size={14} /> 移除
                </button>
              </div>
            </article>
          );
        })}
        {sourceError ? <p className="kd-form-error">{sourceError}</p> : null}
      </section>
    </div>
  );
};
