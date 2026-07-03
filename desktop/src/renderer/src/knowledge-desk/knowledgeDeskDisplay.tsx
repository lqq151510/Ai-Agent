import { BookOpen, FileText, Globe2 } from 'lucide-react';
import type { KnowledgeItem, ModelProvider } from './knowledgeDeskApi';

export const providerStateLabel = (provider: ModelProvider) => {
  if (provider.state === 'connected') return '可用';
  if (provider.state === 'testing') return '待检测';
  if (provider.state === 'local') return '本地';
  return '不可用';
};

export const formatCount = (value: number) => new Intl.NumberFormat('zh-CN').format(value);

export const toPercent = (value: number, total: number) => Math.min(100, Math.max(0, Math.round((value / total) * 100)));

export const sourceIcon = (type: KnowledgeItem['type']) => {
  if (type === 'web') return <Globe2 size={18} />;
  if (type === 'pdf') return <FileText size={18} />;
  if (type === 'markdown') return <BookOpen size={18} />;
  return <FileText size={18} />;
};
