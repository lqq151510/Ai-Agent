import type { ElementType } from 'react';
import { AlertTriangle, Cloud, Database, Download, HardDrive, KeyRound, PanelRight, Plus, RefreshCw, Sparkles, Trash2, UserRound, Shield, SlidersHorizontal, Link2 } from 'lucide-react';
import type { KnowledgeDeskSnapshot, ModelProvider } from './knowledgeDeskApi';
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

export const SettingsPage = ({
  activeTab,
  onTabChange,
  snapshot,
}: {
  activeTab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
  snapshot: KnowledgeDeskSnapshot;
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
      {activeTab === 'profile' ? <ProfileSettings snapshot={snapshot} /> : null}
      {activeTab === 'models' ? <ModelSettings providers={snapshot.modelProviders} /> : null}
      {activeTab === 'ai' ? <AiPreferenceSettings providers={snapshot.modelProviders} profile={snapshot.profile} /> : null}
      {activeTab === 'privacy' ? <PrivacySettings privacyMode={snapshot.profile.privacyMode} /> : null}
      {activeTab === 'integrations' ? <IntegrationSettings /> : null}
    </section>
  </div>
);

const ProfileSettings = ({ snapshot }: { snapshot: KnowledgeDeskSnapshot }) => (
  <div className="kd-stack">
    <SettingsHeader title="账户信息" description="管理身份、设备状态、同步状态、存储占用和数据备份。" />
    <section className="kd-profile-band">
      <div className="kd-profile-avatar">{snapshot.profile.displayName.slice(0, 1) || '泽'}</div>
      <div>
        <h2>{snapshot.profile.displayName}</h2>
        <p>{snapshot.profile.email}</p>
        <div className="kd-inline-status">
          <span><HardDrive size={15} /> MacBook Pro 本地在线</span>
          <span><Cloud size={15} /> {snapshot.source === 'api' ? '本机数据库同步正常' : '未连接数据库'}</span>
        </div>
      </div>
    </section>
    <section className="kd-settings-grid">
      <MetricCard label="知识条目" value={formatCount(snapshot.storage.totalItems)} detail={`${snapshot.storage.archivedItems} 条已归档`} />
      <MetricCard label="本地索引" value={formatCount(snapshot.storage.readyItems)} detail={`${snapshot.storage.inboxItems} 条仍在收集箱`} />
      <MetricCard label="标签资产" value={formatCount(snapshot.storage.totalTags)} detail={`${snapshot.storage.totalModelSources} 个模型源可用`} />
      <MetricCard
        label="数据库连接"
        value={snapshot.source === 'api' ? '已连接' : '未连接'}
        detail={snapshot.source === 'api' ? '正在读取本机知识库' : snapshot.error ?? '后端未启动或认证不可用'}
      />
    </section>
    <div className="kd-settings-actions">
      <button type="button"><Download size={16} /> 导出数据</button>
      <button type="button"><Database size={16} /> 备份知识库</button>
      <button type="button"><RefreshCw size={16} /> 重建索引</button>
    </div>
  </div>
);

const ModelSettings = ({ providers }: { providers: ModelProvider[] }) => (
  <div className="kd-stack">
    <SettingsHeader title="第三方模型配置" description="管理 OpenAI、DeepSeek、Anthropic、OpenRouter 和本地模型源。" />
    <div className="kd-model-grid">
      {providers.map((provider) => (
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
            <dt>默认模型</dt>
            <dd>{provider.model}</dd>
          </dl>
          <div className="kd-model-actions">
            <button disabled={provider.isDefault} type="button">{provider.isDefault ? '默认模型源' : '设为默认'}</button>
            <button type="button">测试连接</button>
            <button type="button">编辑</button>
            <button className="danger" type="button"><Trash2 size={14} /> 删除</button>
          </div>
        </article>
      ))}
      {providers.length === 0 ? (
        <EmptyBlock
          icon={KeyRound}
          title="还没有配置模型源"
          description="添加 OpenAI、DeepSeek、OpenRouter 或本地兼容模型后，整理和检索能力会使用这里的配置。"
        />
      ) : null}
      <button className="kd-add-provider" type="button">
        <Plus size={20} />
        新增模型源
      </button>
    </div>
  </div>
);

const AiPreferenceSettings = ({
  providers,
  profile,
}: {
  providers: ModelProvider[];
  profile: KnowledgeDeskSnapshot['profile'];
}) => {
  const defaultProvider = providers.find((provider) => provider.isDefault) ?? providers[0];
  const defaultModel = defaultProvider ? `${defaultProvider.provider} / ${defaultProvider.model}` : '未配置模型源';

  return (
    <div className="kd-stack">
      <SettingsHeader title="AI 能力偏好" description="为摘要、标签、知识整理和检索问答分配默认模型。" />
      <section className="kd-preference-list">
        <PreferenceRow label="摘要默认模型" value={defaultModel} />
        <PreferenceRow label="标签提取默认模型" value={defaultModel} />
        <PreferenceRow label="知识整理默认模型" value={defaultModel} />
        <PreferenceRow label="检索问答默认模型" value={defaultModel} />
      </section>
      <section className="kd-settings-split">
        <Panel title="响应偏好" icon={Sparkles}>
          <div className="kd-segmented kd-segmented--wide">
            <button type="button">简短</button>
            <button className="is-active" type="button">标准</button>
            <button type="button">详细</button>
          </div>
          <div className="kd-segmented kd-segmented--wide">
            <button type="button">成本优先</button>
            <button className="is-active" type="button">质量优先</button>
            <button type="button">速度优先</button>
          </div>
        </Panel>
        <Panel title="整理策略" icon={PanelRight}>
          <ToggleRow label="自动生成摘要" checked={profile.organizeMode !== 'manual'} />
          <ToggleRow label="自动提取标签" checked={profile.organizeMode !== 'manual'} />
          <ToggleRow label="自动建立主题归类" checked={profile.organizeMode === 'auto'} />
        </Panel>
      </section>
    </div>
  );
};

const PrivacySettings = ({ privacyMode }: { privacyMode: string }) => (
  <div className="kd-stack">
    <SettingsHeader title="隐私与数据控制" description="控制内容是否发送云端模型，并管理缓存、索引和敏感内容提示。" />
    <section className="kd-preference-list">
      <ToggleRow label="允许内容发送给云端模型" checked={privacyMode !== 'local_only'} />
      <ToggleRow label="本地优先处理" checked={privacyMode === 'local_first' || privacyMode === 'local_only'} />
      <ToggleRow label="敏感内容处理提示" checked />
    </section>
    <section className="kd-danger-zone">
      <AlertTriangle size={18} />
      <div>
        <strong>数据清理</strong>
        <p>删除缓存、重建索引和清理知识库前应先导出备份。</p>
      </div>
      <button type="button">删除缓存</button>
      <button type="button">重建索引</button>
    </section>
  </div>
);

const IntegrationSettings = () => (
  <div className="kd-stack">
    <SettingsHeader title="导入与集成设置" description="配置浏览器摘录、本地导入规则、Markdown / PDF 解析偏好和自动整理。" />
    <section className="kd-preference-list">
      <PreferenceRow label="浏览器摘录来源" value="Chrome 扩展已连接" />
      <PreferenceRow label="默认导入目录" value="~/Documents/知识工作台/收集箱" />
      <PreferenceRow label="Markdown 解析" value="保留标题层级、代码块和 frontmatter" />
      <PreferenceRow label="PDF 解析" value="章节识别 + 引用保留 + 图片占位" />
      <PreferenceRow label="默认标签策略" value="主题标签 3 个 + 来源标签 1 个" />
      <ToggleRow label="导入后自动整理" checked />
    </section>
  </div>
);
