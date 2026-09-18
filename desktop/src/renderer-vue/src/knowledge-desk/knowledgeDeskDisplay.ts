import { BookOpen, FileText, Globe2 } from '@lucide/vue'
import type { Component } from 'vue'
import type { KnowledgeItem, ModelProvider } from './knowledgeDeskApi'

export const providerStateLabel = (provider: ModelProvider) => {
  if (provider.state === 'connected') return '可用'
  if (provider.state === 'testing') return '待检测'
  if (provider.state === 'local') return '本地'
  return '不可用'
}

export const formatCount = (value: number) => new Intl.NumberFormat('zh-CN').format(value)

export const toPercent = (value: number, total: number) =>
  Math.min(100, Math.max(0, Math.round((value / total) * 100)))

/**
 * Returns the icon component rather than rendered JSX, so callers can bind it
 * with <component :is="sourceIcon(item.type)" :size="18" />.
 */
export const sourceIcon = (type: KnowledgeItem['type']): Component => {
  if (type === 'web') return Globe2
  if (type === 'pdf') return FileText
  if (type === 'markdown') return BookOpen
  return FileText
}
