import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Zap,
  Activity,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  Send,
  Plus,
  Trash2,
  Check,
  ChevronRight,
  ShieldCheck,
  RefreshCw,
  Cpu,
  Layers,
  Database,
  Terminal,
} from 'lucide-react';
import {
  type KnowledgeDeskSnapshot,
  type ModelProvider,
  type UserMetrics,
  type PromptTestResult,
  loadUserMetrics,
  createModelSource,
  deleteModelSource,
  setDefaultModelSource,
  testModelSource,
  testPromptOnModelSource,
  updateKnowledgeDeskSettingsProfile,
} from '../knowledgeDeskApi';

interface UserProfileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  snapshot: KnowledgeDeskSnapshot;
  onRefreshSnapshot: () => Promise<void>;
  onOpenSettingsTab?: (tab: string) => void;
}

type ProviderPreset = 'deepseek' | 'openai' | 'local_compatible';

interface PresetConfig {
  label: string;
  providerType: ProviderPreset;
  defaultBaseUrl: string;
  defaultModel: string;
  description: string;
  recommendedModels: string[];
}

const PRESETS: Record<ProviderPreset, PresetConfig> = {
  deepseek: {
    label: 'DeepSeek',
    providerType: 'deepseek',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    description: '高性价比高推理能力的 DeepSeek-V3 与 DeepSeek-R1 深度推理模型',
    recommendedModels: ['deepseek-chat', 'deepseek-reasoner'],
  },
  openai: {
    label: 'OpenAI',
    providerType: 'openai',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    description: 'OpenAI 官方通用多模态与推理模型',
    recommendedModels: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
  },
  local_compatible: {
    label: '本地 Ollama / LM Studio',
    providerType: 'local_compatible',
    defaultBaseUrl: 'http://127.0.0.1:11434/v1',
    defaultModel: 'qwen2.5:latest',
    description: '本地隐私部署的开源大模型 (Qwen / Llama)',
    recommendedModels: ['qwen2.5:latest', 'qwen3.5:9b', 'deepseek-r1:8b'],
  },
};

export const UserProfileDrawer: React.FC<UserProfileDrawerProps> = ({
  isOpen,
  onClose,
  snapshot,
  onRefreshSnapshot,
  onOpenSettingsTab,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'models' | 'playground' | 'logs'>('overview');
  const [metrics, setMetrics] = useState<UserMetrics | null>(null);
  const [isLoadingMetrics, setIsLoadingMetrics] = useState(false);

  // New model source form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<ProviderPreset>('deepseek');
  const [formName, setFormName] = useState('DeepSeek-V3 官方');
  const [formBaseUrl, setFormBaseUrl] = useState(PRESETS.deepseek.defaultBaseUrl);
  const [formModel, setFormModel] = useState(PRESETS.deepseek.defaultModel);
  const [formApiKey, setFormApiKey] = useState('');
  const [isSubmittingModel, setIsSubmittingModel] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Playground state
  const [selectedPlaygroundModelId, setSelectedPlaygroundModelId] = useState<string>('');
  const [testPrompt, setTestPrompt] = useState('你好！请用 30 字以内做简短自我介绍，并确认当前 API 连通正常。');
  const [isTestingPrompt, setIsTestingPrompt] = useState(false);
  const [promptResult, setPromptResult] = useState<PromptTestResult | null>(null);

  // General action busy states
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [bannerMessage, setBannerMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Load metrics when opening drawer
  const fetchMetrics = useCallback(async () => {
    setIsLoadingMetrics(true);
    try {
      const data = await loadUserMetrics();
      setMetrics(data);
    } catch {
      // Degraded fallback
    } finally {
      setIsLoadingMetrics(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      void fetchMetrics();
      if (snapshot.modelProviders.length > 0 && !selectedPlaygroundModelId) {
        const defaultSource = snapshot.modelProviders.find(p => p.id === snapshot.profile.defaultModelSourceId);
        setSelectedPlaygroundModelId(defaultSource ? defaultSource.id : snapshot.modelProviders[0].id);
      }
    }
  }, [isOpen, fetchMetrics, snapshot.modelProviders, snapshot.profile.defaultModelSourceId, selectedPlaygroundModelId]);

  // Handle ESC to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handlePresetSelect = (preset: ProviderPreset) => {
    setSelectedPreset(preset);
    const config = PRESETS[preset];
    setFormName(`${config.label} 接入`);
    setFormBaseUrl(config.defaultBaseUrl);
    setFormModel(config.defaultModel);
    setFormApiKey('');
    setFormError(null);
  };

  const handleCreateModel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formBaseUrl.trim() || !formModel.trim()) {
      setFormError('请完整填写名称、Base URL 与模型名称');
      return;
    }
    if (selectedPreset !== 'local_compatible' && !formApiKey.trim()) {
      setFormError('公网模型服务需要提供 API Key');
      return;
    }

    setIsSubmittingModel(true);
    setFormError(null);
    try {
      const created = await createModelSource({
        name: formName.trim(),
        providerType: selectedPreset,
        baseUrl: formBaseUrl.trim(),
        defaultModel: formModel.trim(),
        apiKey: formApiKey.trim() || 'sk-local',
        enabled: true,
        isDefault: snapshot.modelProviders.length === 0,
      });

      // Auto test newly created source
      try {
        await testModelSource(created.id);
      } catch {
        // Non fatal
      }

      await onRefreshSnapshot();
      await fetchMetrics();
      setShowAddForm(false);
      setFormApiKey('');
      setBannerMessage({ text: `模型源【${created.provider}】接入成功！`, type: 'success' });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmittingModel(false);
    }
  };

  const handleSetDefault = async (provider: ModelProvider) => {
    setBusyAction(`default:${provider.id}`);
    try {
      await setDefaultModelSource(provider.id);
      await updateKnowledgeDeskSettingsProfile({
        defaultModelSourceId: provider.id,
        summaryModelSourceId: provider.id,
      });
      await onRefreshSnapshot();
      setBannerMessage({ text: `已将【${provider.provider}】设为全局默认推理模型`, type: 'success' });
    } catch (err) {
      setBannerMessage({ text: err instanceof Error ? err.message : '设置默认模型失败', type: 'error' });
    } finally {
      setBusyAction(null);
    }
  };

  const handleTestConnect = async (provider: ModelProvider) => {
    setBusyAction(`test:${provider.id}`);
    try {
      const res = await testModelSource(provider.id);
      await onRefreshSnapshot();
      await fetchMetrics();
      setBannerMessage({ text: res.message || `${provider.provider} 连通性测试通过！`, type: 'success' });
    } catch (err) {
      setBannerMessage({ text: err instanceof Error ? err.message : '连通测试失败', type: 'error' });
    } finally {
      setBusyAction(null);
    }
  };

  const handleDeleteModel = async (provider: ModelProvider) => {
    if (!window.confirm(`确定要移除模型源【${provider.provider}】吗？`)) return;
    setBusyAction(`delete:${provider.id}`);
    try {
      await deleteModelSource(provider.id);
      await onRefreshSnapshot();
      await fetchMetrics();
      setBannerMessage({ text: `已移除【${provider.provider}】`, type: 'success' });
    } catch (err) {
      setBannerMessage({ text: err instanceof Error ? err.message : '删除失败', type: 'error' });
    } finally {
      setBusyAction(null);
    }
  };

  const handleRunPlaygroundTest = async () => {
    if (!selectedPlaygroundModelId) {
      setBannerMessage({ text: '请先选择要测试的模型源', type: 'error' });
      return;
    }
    setIsTestingPrompt(true);
    setPromptResult(null);
    try {
      const result = await testPromptOnModelSource(selectedPlaygroundModelId, testPrompt);
      setPromptResult(result);
      // Refresh real metrics after test
      void fetchMetrics();
      if (!result.success) {
        setBannerMessage({ text: `调用异常: ${result.message}`, type: 'error' });
      }
    } catch (err) {
      setBannerMessage({ text: err instanceof Error ? err.message : 'Prompt 测试失败', type: 'error' });
    } finally {
      setIsTestingPrompt(false);
    }
  };

  if (!isOpen) return null;

  const defaultModelSource = snapshot.modelProviders.find(p => p.id === snapshot.profile.defaultModelSourceId);

  return (
    <div className="kd-drawer-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="kd-drawer-panel" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="kd-drawer-header">
          <div className="kd-drawer-user-info">
            <div className="kd-drawer-avatar">
              {snapshot.profile.displayName.slice(0, 1) || '泽'}
              <span className="kd-online-dot" title="在线" />
            </div>
            <div>
              <div className="kd-drawer-name-row">
                <h2>{snapshot.profile.displayName || '泽宝'}</h2>
                <span className="kd-badge-role">AI + Java 开发者</span>
              </div>
              <p className="kd-drawer-email">{snapshot.profile.email || 'zebao@agent.local'}</p>
            </div>
          </div>
          <button className="kd-drawer-close" onClick={onClose} aria-label="关闭个人中心">
            <X size={20} />
          </button>
        </div>

        {/* Banner */}
        {bannerMessage && (
          <div className={`kd-drawer-banner kd-drawer-banner--${bannerMessage.type}`}>
            {bannerMessage.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            <span>{bannerMessage.text}</span>
            <button onClick={() => setBannerMessage(null)}><X size={14} /></button>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="kd-drawer-tabs">
          <button
            className={activeTab === 'overview' ? 'is-active' : ''}
            onClick={() => setActiveTab('overview')}
          >
            <Activity size={16} />
            真实数据看板
          </button>
          <button
            className={activeTab === 'models' ? 'is-active' : ''}
            onClick={() => setActiveTab('models')}
          >
            <KeyRound size={16} />
            模型 API 接入 ({snapshot.modelProviders.length})
          </button>
          <button
            className={activeTab === 'playground' ? 'is-active' : ''}
            onClick={() => setActiveTab('playground')}
          >
            <Terminal size={16} />
            实时测试终端
          </button>
          <button
            className={activeTab === 'logs' ? 'is-active' : ''}
            onClick={() => setActiveTab('logs')}
          >
            <Clock size={16} />
            调用日志
          </button>
        </div>

        {/* Tab Content */}
        <div className="kd-drawer-body">
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="kd-drawer-section">
              <div className="kd-metrics-row">
                <div className="kd-metric-box">
                  <div className="kd-metric-head">
                    <span className="kd-metric-title">总消耗 Token</span>
                    <Zap size={16} className="kd-icon-primary" />
                  </div>
                  <div className="kd-metric-value">
                    {(metrics?.totalTokens ?? 0).toLocaleString()}
                  </div>
                  <div className="kd-metric-sub">
                    今日: +{(metrics?.todayTokens ?? 0).toLocaleString()} Token
                  </div>
                </div>

                <div className="kd-metric-box">
                  <div className="kd-metric-head">
                    <span className="kd-metric-title">API 调用成功率</span>
                    <ShieldCheck size={16} className="kd-icon-success" />
                  </div>
                  <div className="kd-metric-value">
                    {metrics?.successRate ? `${metrics.successRate}%` : '100%'}
                  </div>
                  <div className="kd-metric-sub">
                    总调用: {metrics?.totalCalls ?? 0} 次 (失败 {metrics?.failedCalls ?? 0})
                  </div>
                </div>

                <div className="kd-metric-box">
                  <div className="kd-metric-head">
                    <span className="kd-metric-title">平均响应延迟</span>
                    <Clock size={16} className="kd-icon-warning" />
                  </div>
                  <div className="kd-metric-value">
                    {metrics?.averageLatencyMs ?? 0} <span className="kd-unit">ms</span>
                  </div>
                  <div className="kd-metric-sub">
                    模型推理平均往返耗时
                  </div>
                </div>

                <div className="kd-metric-box">
                  <div className="kd-metric-head">
                    <span className="kd-metric-title">已接入模型源</span>
                    <Cpu size={16} className="kd-icon-purple" />
                  </div>
                  <div className="kd-metric-value">
                    {snapshot.modelProviders.length} <span className="kd-unit">个</span>
                  </div>
                  <div className="kd-metric-sub">
                    默认: {defaultModelSource?.provider || '未设置'}
                  </div>
                </div>
              </div>

              {/* Token Breakdown Bar */}
              <div className="kd-token-card">
                <div className="kd-token-card-head">
                  <strong>Token 结构细分与持久化</strong>
                  <button className="kd-btn-icon-subtle" onClick={() => void fetchMetrics()} title="刷新统计">
                    <RefreshCw size={14} className={isLoadingMetrics ? 'kd-spin' : ''} />
                  </button>
                </div>
                <div className="kd-token-details">
                  <div className="kd-token-item">
                    <span>Prompt 输入 Token</span>
                    <strong>{(metrics?.promptTokens ?? 0).toLocaleString()}</strong>
                  </div>
                  <div className="kd-token-item">
                    <span>Completion 输出 Token</span>
                    <strong>{(metrics?.completionTokens ?? 0).toLocaleString()}</strong>
                  </div>
                  <div className="kd-token-item">
                    <span>数据存储状态</span>
                    <strong className="kd-text-success">MyBatis-Plus 实时入库</strong>
                  </div>
                </div>
              </div>

              {/* Knowledge & Asset Overview */}
              <div className="kd-asset-overview">
                <h3>知识资产与工单状态</h3>
                <div className="kd-asset-grid">
                  <div className="kd-asset-item">
                    <Database size={18} />
                    <div>
                      <div className="kd-asset-num">{snapshot.storage.totalItems}</div>
                      <div className="kd-asset-lbl">已索引知识条目</div>
                    </div>
                  </div>
                  <div className="kd-asset-item">
                    <Layers size={18} />
                    <div>
                      <div className="kd-asset-num">{snapshot.storage.inboxItems}</div>
                      <div className="kd-asset-lbl">收集箱待整理</div>
                    </div>
                  </div>
                  <div className="kd-asset-item">
                    <Sparkles size={18} />
                    <div>
                      <div className="kd-asset-num">{snapshot.storage.totalTags}</div>
                      <div className="kd-asset-lbl">标签概念资产</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: MODEL MANAGEMENT */}
          {activeTab === 'models' && (
            <div className="kd-drawer-section">
              <div className="kd-section-bar">
                <div>
                  <h3>模型 API 接入池</h3>
                  <p className="kd-subtext">支持接入 DeepSeek、OpenAI 及本地模型，API Key 将加密安全存储。</p>
                </div>
                {!showAddForm && (
                  <button
                    className="kd-btn-primary kd-btn-sm"
                    onClick={() => setShowAddForm(true)}
                  >
                    <Plus size={15} />
                    接入新模型 API
                  </button>
                )}
              </div>

              {/* Add Model Form */}
              {showAddForm && (
                <form className="kd-model-form-card" onSubmit={handleCreateModel}>
                  <div className="kd-form-header">
                    <strong>接入新大模型 API</strong>
                    <button type="button" className="kd-btn-close" onClick={() => setShowAddForm(false)}>
                      <X size={16} />
                    </button>
                  </div>

                  {/* Preset Selector */}
                  <div className="kd-preset-selector">
                    {(Object.keys(PRESETS) as ProviderPreset[]).map((presetKey) => {
                      const preset = PRESETS[presetKey];
                      return (
                        <button
                          type="button"
                          key={presetKey}
                          className={`kd-preset-btn ${selectedPreset === presetKey ? 'is-selected' : ''}`}
                          onClick={() => handlePresetSelect(presetKey)}
                        >
                          <strong>{preset.label}</strong>
                          <span>{preset.defaultModel}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="kd-form-grid">
                    <label className="kd-form-field">
                      <span>名称标识</span>
                      <input
                        type="text"
                        value={formName}
                        onChange={(e) => setFormName(e.target.value)}
                        placeholder="例如: DeepSeek 官方"
                        required
                      />
                    </label>

                    <label className="kd-form-field">
                      <span>Base URL (API 地址)</span>
                      <input
                        type="text"
                        value={formBaseUrl}
                        onChange={(e) => setFormBaseUrl(e.target.value)}
                        placeholder="例如: https://api.deepseek.com/v1"
                        required
                      />
                    </label>

                    <label className="kd-form-field">
                      <span>默认模型 (Model Name)</span>
                      <input
                        type="text"
                        value={formModel}
                        onChange={(e) => setFormModel(e.target.value)}
                        placeholder="例如: deepseek-chat"
                        required
                      />
                    </label>

                    <label className="kd-form-field">
                      <span>API Key 凭证</span>
                      <input
                        type="password"
                        value={formApiKey}
                        onChange={(e) => setFormApiKey(e.target.value)}
                        placeholder={selectedPreset === 'local_compatible' ? '本地无需 Key (选填)' : 'sk-••••••••••••••••'}
                      />
                    </label>
                  </div>

                  {formError && <div className="kd-form-error">{formError}</div>}

                  <div className="kd-form-actions">
                    <button
                      type="button"
                      className="kd-btn-secondary kd-btn-sm"
                      onClick={() => setShowAddForm(false)}
                      disabled={isSubmittingModel}
                    >
                      取消
                    </button>
                    <button
                      type="submit"
                      className="kd-btn-primary kd-btn-sm"
                      disabled={isSubmittingModel}
                    >
                      {isSubmittingModel ? <RefreshCw size={14} className="kd-spin" /> : <Check size={14} />}
                      {isSubmittingModel ? '验证并保存中...' : '保存并接入'}
                    </button>
                  </div>
                </form>
              )}

              {/* Models List */}
              <div className="kd-model-list">
                {snapshot.modelProviders.length === 0 ? (
                  <div className="kd-empty-box">
                    <Cpu size={36} />
                    <p>暂无接入的模型 API</p>
                    <button className="kd-btn-primary kd-btn-sm" onClick={() => setShowAddForm(true)}>
                      立即接入 DeepSeek / OpenAI
                    </button>
                  </div>
                ) : (
                  snapshot.modelProviders.map((provider) => {
                    const isDefault = snapshot.profile.defaultModelSourceId === provider.id;
                    const isBusy = busyAction?.includes(provider.id);

                    return (
                      <div className={`kd-model-item ${isDefault ? 'is-default' : ''}`} key={provider.id}>
                        <div className="kd-model-item-top">
                          <div className="kd-model-title-group">
                            <div className={`kd-provider-indicator kd-provider-indicator--${provider.lastCheckStatus || 'ok'}`} />
                            <div>
                              <div className="kd-model-name-row">
                                <strong>{provider.provider}</strong>
                                {isDefault && <span className="kd-badge-default">默认模型</span>}
                                <span className="kd-badge-tag">{provider.providerType}</span>
                              </div>
                              <div className="kd-model-meta-line">
                                <span>{provider.baseUrl}</span>
                                <span>·</span>
                                <span>模型: <code>{provider.model}</code></span>
                                <span>·</span>
                                <span>Key: {provider.keyState || '已配置'}</span>
                              </div>
                            </div>
                          </div>

                          <div className="kd-model-item-actions">
                            <button
                              className="kd-btn-subtle"
                              onClick={() => void handleTestConnect(provider)}
                              disabled={isBusy}
                              title="测试连通性"
                            >
                              <RefreshCw size={14} className={busyAction === `test:${provider.id}` ? 'kd-spin' : ''} />
                              测试连通
                            </button>

                            {!isDefault && (
                              <button
                                className="kd-btn-subtle"
                                onClick={() => void handleSetDefault(provider)}
                                disabled={isBusy}
                                title="设为默认"
                              >
                                <Check size={14} />
                                设为默认
                              </button>
                            )}

                            <button
                              className="kd-btn-danger-subtle"
                              onClick={() => void handleDeleteModel(provider)}
                              disabled={isBusy}
                              title="移除模型"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>

                        {provider.lastCheckMessage && (
                          <div className="kd-model-item-status">
                            <span className="kd-subtext">最近检测: {provider.lastCheckMessage}</span>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* TAB 3: PLAYGROUND / REAL PROMPT TEST */}
          {activeTab === 'playground' && (
            <div className="kd-drawer-section">
              <div className="kd-playground-head">
                <div>
                  <h3>在线模型 Prompt 测试终端</h3>
                  <p className="kd-subtext">发起真实 HTTP 请求，验证模型返回与延迟，并在后端记录 Token 用量。</p>
                </div>
              </div>

              <div className="kd-playground-controls">
                <label className="kd-form-field">
                  <span>选择测试模型</span>
                  <select
                    value={selectedPlaygroundModelId}
                    onChange={(e) => setSelectedPlaygroundModelId(e.target.value)}
                    disabled={isTestingPrompt}
                  >
                    {snapshot.modelProviders.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.provider} ({p.model})
                      </option>
                    ))}
                  </select>
                </label>

                <label className="kd-form-field">
                  <span>测试 Prompt</span>
                  <textarea
                    rows={3}
                    value={testPrompt}
                    onChange={(e) => setTestPrompt(e.target.value)}
                    placeholder="输入测试提示词..."
                    disabled={isTestingPrompt}
                  />
                </label>

                <button
                  className="kd-btn-primary kd-btn-block"
                  onClick={handleRunPlaygroundTest}
                  disabled={isTestingPrompt || !selectedPlaygroundModelId}
                >
                  {isTestingPrompt ? <RefreshCw size={16} className="kd-spin" /> : <Send size={16} />}
                  {isTestingPrompt ? '正在发送并接收模型响应...' : '发起真实调用测试'}
                </button>
              </div>

              {/* Result Area */}
              {promptResult && (
                <div className={`kd-prompt-result-card ${promptResult.success ? 'is-success' : 'is-failed'}`}>
                  <div className="kd-result-header">
                    <div className="kd-result-status-row">
                      {promptResult.success ? (
                        <CheckCircle2 size={16} className="kd-icon-success" />
                      ) : (
                        <AlertCircle size={16} className="kd-icon-error" />
                      )}
                      <strong>{promptResult.success ? '调用成功' : '调用失败'}</strong>
                      <span className="kd-badge-latency">{promptResult.latencyMs} ms</span>
                    </div>

                    <div className="kd-result-tokens">
                      <span>Prompt: {promptResult.promptTokens}</span>
                      <span>+</span>
                      <span>Completion: {promptResult.completionTokens}</span>
                      <span>=</span>
                      <strong>Total: {promptResult.totalTokens} Tokens</strong>
                    </div>
                  </div>

                  <div className="kd-result-body">
                    <strong>模型回复内容：</strong>
                    <div className="kd-result-content">
                      {promptResult.reply || promptResult.message}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: CALL LOGS */}
          {activeTab === 'logs' && (
            <div className="kd-drawer-section">
              <div className="kd-section-bar">
                <div>
                  <h3>最近 API 调用日志</h3>
                  <p className="kd-subtext">由后端数据库真实记录的每次模型请求详情</p>
                </div>
                <button className="kd-btn-subtle kd-btn-sm" onClick={() => void fetchMetrics()}>
                  <RefreshCw size={14} className={isLoadingMetrics ? 'kd-spin' : ''} />
                  刷新日志
                </button>
              </div>

              <div className="kd-log-list">
                {!metrics?.recentLogs || metrics.recentLogs.length === 0 ? (
                  <div className="kd-empty-box">
                    <Clock size={32} />
                    <p>暂无调用记录，去测试终端发送一条 Prompt 吧！</p>
                  </div>
                ) : (
                  metrics.recentLogs.map((log) => (
                    <div className="kd-log-item" key={log.id}>
                      <div className="kd-log-head">
                        <div className="kd-log-provider-row">
                          <span className={`kd-log-badge kd-log-badge--${log.status}`}>
                            {log.status === 'success' ? '成功' : '失败'}
                          </span>
                          <strong>{log.modelName}</strong>
                          <span className="kd-log-type">({log.providerType})</span>
                        </div>
                        <span className="kd-log-time">
                          {new Date(log.createdAt).toLocaleTimeString()}
                        </span>
                      </div>
                      <div className="kd-log-metrics">
                        <span>耗时: <strong>{log.latencyMs} ms</strong></span>
                        <span>Token: <strong>{log.totalTokens}</strong> (输入: {log.promptTokens}, 输出: {log.completionTokens})</span>
                      </div>
                      {log.errorMessage && (
                        <div className="kd-log-error">{log.errorMessage}</div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="kd-drawer-footer">
          <button
            className="kd-btn-subtle kd-btn-sm"
            onClick={() => {
              onClose();
              if (onOpenSettingsTab) onOpenSettingsTab('profile');
            }}
          >
            打开全屏设置中心 <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};
