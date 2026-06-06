import React, { useMemo, useState } from 'react';
import type { ModelOption, Provider } from '../../types';
import { defaultModel } from '../../utils';
import { MessageSquarePlus, Plus } from 'lucide-react';

const RECENT_MODEL_KEY = 'ai_agent_recent_model';

export function recentModelKey(provider: Provider) {
  return `${RECENT_MODEL_KEY}:${provider}`;
}

export interface NewSessionFormProps {
  modelOptions: ModelOption[];
  contextTokenLimit: number | null;
  onCreateSession: (provider: Provider, model: string, title?: string, contextTokenLimit?: number | null) => void;
}

export const NewSessionForm: React.FC<NewSessionFormProps> = ({
  modelOptions,
  contextTokenLimit,
  onCreateSession,
}) => {
  const [createProvider, setCreateProvider] = useState<Provider>('OPENAI');
  const [createTitle, setCreateTitle] = useState('');

  const optionsByProvider = useMemo(() => {
    const grouped: Record<Provider, ModelOption[]> = {
      OPENAI: []
    };
    for (const option of modelOptions) {
      (grouped[option.provider] ??= []).push(option);
    }
    return grouped;
  }, [modelOptions]);

  const pickModel = (provider: Provider): string => {
    const recent = localStorage.getItem(recentModelKey(provider));
    const options = optionsByProvider[provider];
    if (recent && options.some(option => option.model === recent)) {
      return recent;
    }
    const preferred = options.find(option => option.isDefault)?.model || options[0]?.model;
    return preferred || defaultModel(provider);
  };

  const [createModel, setCreateModel] = useState(pickModel('OPENAI'));
  const providerModels = optionsByProvider[createProvider];

  const handleCreate = async () => {
    const model = createModel.trim() || pickModel(createProvider);
    await onCreateSession(createProvider, model, createTitle.trim() || undefined, contextTokenLimit);
    localStorage.setItem(recentModelKey(createProvider), model);
    setCreateTitle('');
    setCreateModel(pickModel(createProvider));
  };

  return (
    <section className="section new-session-form">
      <div className="section-heading">
        <MessageSquarePlus size={16} />
        <h3>新会话</h3>
      </div>
      <label htmlFor="provider">Provider</label>
      <select
        id="provider"
        value={createProvider}
        onChange={e => {
          const provider = e.target.value as Provider;
          setCreateProvider(provider);
          setCreateModel(pickModel(provider));
        }}
      >
        <option value="OPENAI">OPENAI</option>
      </select>
      <label htmlFor="model">Model</label>
      <input
        id="model"
        list={`model-list-${createProvider}`}
        value={createModel}
        onChange={e => setCreateModel(e.target.value)}
        placeholder={pickModel(createProvider)}
      />
      <datalist id={`model-list-${createProvider}`}>
        {providerModels.map(option => (
          <option key={option.model} value={option.model} />
        ))}
      </datalist>
      <label htmlFor="title">Title（可选）</label>
      <input id="title" value={createTitle} onChange={e => setCreateTitle(e.target.value)} placeholder="例如：仓库结构分析" />
      <button className="primary create-btn" onClick={handleCreate}>
        <Plus size={16} />
        创建会话
      </button>
    </section>
  );
};
