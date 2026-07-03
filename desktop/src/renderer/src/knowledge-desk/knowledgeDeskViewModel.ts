import type { KnowledgeItem } from './knowledgeDeskApi';

export type FilterCategory = 'source' | 'time' | 'tag';
export type ItemFilters = Record<FilterCategory, string[]>;

export const emptyFilters: ItemFilters = {
  source: [],
  time: [],
  tag: [],
};

export const typeCopy: Record<KnowledgeItem['type'], string> = {
  web: '网页',
  pdf: 'PDF',
  markdown: 'Markdown',
  paste: '粘贴',
  snippet: '片段',
};

export const filterLocalItems = (items: KnowledgeItem[], query: string) => {
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
  if (tokens.length === 0) return items.slice(0, 10);
  return items
    .filter((item) => {
      const haystack = [item.title, item.summary, item.source, ...item.tags].join(' ').toLowerCase();
      return tokens.some((token) => haystack.includes(token));
    })
    .slice(0, 10);
};

export const applyItemFilters = (items: KnowledgeItem[], filters: ItemFilters) => (
  items.filter((item) => {
    if (filters.source.length > 0 && !filters.source.includes(sourceFilterLabel(item))) {
      return false;
    }
    if (filters.time.length > 0 && !filters.time.some((range) => itemMatchesTimeRange(item, range))) {
      return false;
    }
    if (filters.tag.length > 0 && !filters.tag.some((tag) => item.tags.includes(tag))) {
      return false;
    }
    return true;
  })
);

export const toggleFilterValue = (filters: ItemFilters, category: FilterCategory, value: string): ItemFilters => {
  const currentValues = filters[category];
  const nextValues = currentValues.includes(value)
    ? currentValues.filter((current) => current !== value)
    : [...currentValues, value];
  return { ...filters, [category]: nextValues };
};

export const activeFilterCount = (filters: ItemFilters) => (
  filters.source.length + filters.time.length + filters.tag.length
);

export const buildSourceOptions = (items: KnowledgeItem[], fallback: string[]) => {
  const values = uniqueValues(items.map(sourceFilterLabel));
  return values.length > 0 ? values : fallback;
};

export const buildTagOptions = (items: KnowledgeItem[], fallback: string[]) => {
  const values = uniqueValues(items.flatMap((item) => item.tags)).slice(0, 8);
  return values.length > 0 ? values : uniqueValues(fallback).slice(0, 8);
};

export const buildSearchSnippet = (item: KnowledgeItem, query: string) => {
  const keyword = query.trim().split(/\s+/)[0];
  if (!keyword) return item.summary;
  if (item.summary.includes(keyword)) return item.summary;
  return `${item.summary} 关联关键词：${keyword}`;
};

const uniqueValues = (values: string[]) => (
  Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
);

const sourceFilterLabel = (item: KnowledgeItem) => {
  if (item.type === 'web') return '网页摘录';
  if (item.type === 'pdf') return 'PDF';
  if (item.type === 'markdown') return 'Markdown';
  if (item.type === 'paste' || item.type === 'snippet') return '粘贴内容';
  return typeCopy[item.type];
};

const itemMatchesTimeRange = (item: KnowledgeItem, range: string) => {
  const normalized = item.time.toLowerCase();
  if (range === '今天') {
    return normalized.includes('今天') || normalized.includes('分钟前') || normalized.includes('小时前');
  }
  if (range === '本周') {
    return !normalized.includes('更早') && !normalized.includes('上月');
  }
  if (range === '本月') {
    return !normalized.includes('更早');
  }
  if (range === '更早') {
    return normalized.includes('更早') || normalized.includes('上月') || normalized.includes('去年');
  }
  return false;
};
