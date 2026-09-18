<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Clock3, Globe2, Search, Tags } from '@lucide/vue'
import type { KnowledgeItem, KnowledgeItemPage } from '../knowledgeDeskApi'
import { searchKnowledgeItems } from '../knowledgeDeskApi'
import { EmptyState, ErrorCard, HighlightText } from '../components'
import { FilterGroup, FilterSummary, StatusPill } from '../shared'
import { formatCount } from '../knowledgeDeskDisplay'
import {
  applyItemFilters, buildSearchCorpus, buildSearchSnippet,
  buildSourceOptions, buildTagOptions, emptyFilters, filterLocalItems,
  filterSearchItemsByStatus, typeCopy, type ItemFilters, type SearchStatusFilter,
} from '../knowledgeDeskViewModel'
import CollectionPagination from './CollectionPagination.vue'

const SEARCH_HISTORY_KEY = 'kd:search-history'
const MAX_HISTORY = 6
const SEARCH_PAGE_SIZE = 12
const searchStatusOptions: Array<{ id: SearchStatusFilter; label: string }> = [
  { id: 'all', label: '全部资料' }, { id: 'pending', label: '待整理' },
  { id: 'processing', label: '整理中' }, { id: 'done', label: '知识库' },
  { id: 'failed', label: '需重试' }, { id: 'archived', label: '归档' },
]

const props = defineProps<{
  apiEnabled: boolean
  availableTags: string[]
  searchableItems: KnowledgeItem[]
  onOpenDetail: (item: KnowledgeItem) => void
}>()

const query = ref('')
const resultPage = ref<KnowledgeItemPage | null>(null)
const filters = ref<ItemFilters>(emptyFilters)
const statusFilter = ref<SearchStatusFilter>('all')
const isSearching = ref(false)
const searchError = ref<string | null>(null)
const hasSearched = ref(false)
const searchHistory = ref<string[]>(loadSearchHistory())
const input = ref<HTMLInputElement | null>(null)
let latestRequestId = 0

const corpus = computed(() => buildSearchCorpus(props.searchableItems))
const visibleResults = computed(() => resultPage.value?.items ?? [])
const totalResults = computed(() => resultPage.value?.total ?? 0)
const currentPage = computed(() => resultPage.value?.page ?? 1)
const currentPageSize = computed(() => resultPage.value?.pageSize ?? SEARCH_PAGE_SIZE)
const sourceOptions = computed(() => buildSourceOptions(visibleResults.value, ['网页摘录', 'PDF', 'Markdown', '粘贴内容']))
const tagOptions = computed(() => buildTagOptions(visibleResults.value, props.availableTags))
const suggestedTags = computed(() => Array.from(new Set(corpus.value.flatMap((item) => item.tags))).slice(0, 6))
const suggestedSources = computed(() => Array.from(new Set(corpus.value.map((item) => item.source))).slice(0, 4))

function loadSearchHistory(): string[] {
  try {
    const raw = localStorage.getItem(SEARCH_HISTORY_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((term): term is string => typeof term === 'string') : []
  } catch { return [] }
}

function addToHistory(term: string) {
  const normalized = term.trim()
  if (!normalized) return
  const next = [normalized, ...searchHistory.value.filter((item) => item !== normalized)].slice(0, MAX_HISTORY)
  searchHistory.value = next
  try { localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next)) } catch { /* optional storage */ }
}

function serverSearchStatus(status: SearchStatusFilter) {
  if (status === 'pending') return 'inbox' as const
  if (status === 'done') return 'ready' as const
  return status === 'all' ? undefined : status
}
function serverSearchSourceType(source: string | undefined) {
  if (source === '网页摘录') return 'web' as const
  if (source === 'PDF') return 'pdf' as const
  if (source === 'Markdown') return 'markdown' as const
  if (source === '粘贴内容') return 'snippet' as const
  return undefined
}
function serverSearchDateRange(ranges: string[]) {
  const range = ranges[0]
  if (!range) return {}
  const now = new Date(); const from = new Date(now); from.setHours(0, 0, 0, 0)
  if (range === '更早') {
    const endOfPreviousMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    endOfPreviousMonth.setMilliseconds(-1)
    return { to: endOfPreviousMonth.toISOString() }
  }
  if (range === '本周') from.setDate(from.getDate() - ((from.getDay() + 6) % 7))
  else if (range === '本月') from.setDate(1)
  else if (range !== '今天') return {}
  return { from: from.toISOString(), to: now.toISOString() }
}
function buildLocalSearchPage(nextQuery: string, nextFilters: ItemFilters, nextStatus: SearchStatusFilter, requestedPage: number): KnowledgeItemPage {
  const filtered = applyItemFilters(filterSearchItemsByStatus(filterLocalItems(corpus.value, nextQuery, corpus.value.length), nextStatus), nextFilters)
  const totalPages = Math.max(1, Math.ceil(filtered.length / SEARCH_PAGE_SIZE))
  const page = Math.min(Math.max(requestedPage, 1), totalPages)
  const start = (page - 1) * SEARCH_PAGE_SIZE
  return { items: filtered.slice(start, start + SEARCH_PAGE_SIZE), total: filtered.length, page, pageSize: SEARCH_PAGE_SIZE }
}
async function runSearch({
  nextFilters = filters.value, nextPage = 1, nextQuery = query.value, nextStatus = statusFilter.value,
}: { nextFilters?: ItemFilters; nextPage?: number; nextQuery?: string; nextStatus?: SearchStatusFilter } = {}) {
  const normalizedQuery = nextQuery.trim(); const requestId = ++latestRequestId
  isSearching.value = true; searchError.value = null; hasSearched.value = true
  try {
    if (props.apiEnabled) {
      const apiResult = await searchKnowledgeItems({
        query: normalizedQuery, tag: nextFilters.tag[0], sourceType: serverSearchSourceType(nextFilters.source[0]),
        status: serverSearchStatus(nextStatus), page: nextPage, pageSize: SEARCH_PAGE_SIZE,
        ...serverSearchDateRange(nextFilters.time),
      })
      if (requestId !== latestRequestId) return
      resultPage.value = apiResult
    } else resultPage.value = buildLocalSearchPage(normalizedQuery, nextFilters, nextStatus, nextPage)
    if (requestId === latestRequestId) addToHistory(normalizedQuery)
  } catch (reason) {
    if (requestId !== latestRequestId) return
    resultPage.value = buildLocalSearchPage(normalizedQuery, nextFilters, nextStatus, nextPage)
    searchError.value = reason instanceof Error ? reason.message : String(reason)
    addToHistory(normalizedQuery)
  } finally { if (requestId === latestRequestId) isSearching.value = false }
}
function resetSearch() {
  latestRequestId += 1; resultPage.value = null; searchError.value = null; hasSearched.value = false; isSearching.value = false
}
function applySuggestion(term: string) { query.value = term; void runSearch({ nextQuery: term }) }
function updateFilters(category: keyof ItemFilters, value: string) {
  const values = filters.value[category]
  filters.value = { ...filters.value, [category]: values.includes(value) ? [] : [value] }
  if (hasSearched.value) void runSearch({ nextFilters: filters.value })
}
function updateStatusFilter(nextStatus: SearchStatusFilter) {
  statusFilter.value = nextStatus
  if (hasSearched.value) void runSearch({ nextStatus })
}
function clearFilters() { filters.value = emptyFilters; if (hasSearched.value) void runSearch({ nextFilters: emptyFilters }) }
onMounted(() => input.value?.focus())
</script>

<template>
  <div class="kd-search-page">
    <header class="kd-page-identity kd-page-identity--search"><div><p>QUERY ROOM / GLOBAL SEARCH</p><h2>不是翻找，是重新抵达。</h2><span>从主题、来源、标签或一句关键话，回到它最初留下来的位置。</span></div><strong aria-hidden="true">04</strong></header>
    <form class="kd-search-box" @submit.prevent="void runSearch()"><Search :size="24" /><input ref="input" v-model="query" aria-label="全局搜索" placeholder="搜索主题、来源、标签、关键句" @input="resetSearch" /><button class="kd-action-button kd-action-button--primary" :disabled="isSearching" type="submit">{{ isSearching ? '搜索中' : '搜索' }}</button></form>
    <div v-if="!hasSearched" class="kd-search-tips">
      <div class="kd-search-tip-section"><strong>最近搜索</strong><div v-if="searchHistory.length" class="kd-search-tip-list"><button v-for="term in searchHistory" :key="term" type="button" @click="applySuggestion(term)"><Clock3 :size="13" />{{ term }}</button></div><span v-else class="kd-muted">暂无搜索记录，输入关键词开始第一次搜索。</span></div>
      <div class="kd-search-tip-section"><strong>搜索建议</strong><div class="kd-search-tip-list"><button v-for="tag in suggestedTags" :key="`tag-${tag}`" type="button" @click="applySuggestion(tag)"><Tags :size="13" />{{ tag }}</button><button v-for="source in suggestedSources" :key="`source-${source}`" type="button" @click="applySuggestion(source)"><Globe2 :size="13" />{{ source }}</button><span v-if="suggestedTags.length === 0 && suggestedSources.length === 0" class="kd-muted">导入并整理资料后，这里会显示热门标签和来源。</span></div></div>
    </div>
    <template v-if="hasSearched">
      <div class="kd-search-toolbar"><div class="kd-segmented kd-search-status-filter" aria-label="搜索状态筛选"><button v-for="option in searchStatusOptions" :key="option.id" :class="statusFilter === option.id ? 'is-active' : ''" type="button" @click="updateStatusFilter(option.id)">{{ option.label }}</button></div><div class="kd-search-scope" aria-live="polite"><strong>{{ formatCount(totalResults) }}</strong><span>条符合条件</span><span>{{ apiEnabled ? '服务端全库检索' : '当前已加载条目' }}</span></div></div>
      <div class="kd-search-layout"><aside class="kd-filter-rail"><FilterGroup :active-values="filters.source" :on-toggle="(value: string) => updateFilters('source', value)" selection-mode="single" title="来源" :values="sourceOptions" /><FilterGroup :active-values="filters.tag" :on-toggle="(value: string) => updateFilters('tag', value)" selection-mode="single" title="标签" :values="tagOptions" /><FilterGroup :active-values="filters.time" :on-toggle="(value: string) => updateFilters('time', value)" selection-mode="single" title="时间" :values="['今天', '本周', '本月', '更早']" /><FilterSummary :filters="filters" :on-clear="clearFilters" :result-count="visibleResults.length" :total-count="totalResults" /></aside>
        <section class="kd-search-results"><ErrorCard v-if="searchError" description="数据库搜索暂不可用，已使用当前可见条目过滤。" :error="searchError" :on-retry="() => void runSearch({ nextPage: currentPage })" retry-label="重试搜索" title="搜索服务异常" /><article v-for="item in visibleResults" :key="item.id" :aria-label="`打开知识条目：${item.title}`" class="kd-search-result" role="button" tabindex="0" @click="onOpenDetail(item)" @keydown.enter="onOpenDetail(item)" @keydown.space.prevent="onOpenDetail(item)"><div class="kd-result-head"><span class="kd-type-badge">{{ typeCopy[item.type] }}</span><span>{{ item.source }}</span><span>{{ item.time }}</span><StatusPill v-if="item.status" :status="item.status" /></div><h3><HighlightText :query="query" :text="item.title" /></h3><p>命中片段：<HighlightText :query="query" :text="buildSearchSnippet(item, query)" /></p><small><HighlightText :query="query" :text="item.summary" /></small></article><EmptyState v-if="visibleResults.length === 0" :icon="Search" :title="query.trim() ? '未找到匹配结果' : '还没有符合条件的资料'" :description="query.trim() ? '尝试更换关键词、清空筛选条件，或从左侧选择其他来源和标签。' : '可输入主题、来源、标签或关键句，也可直接按筛选条件浏览全库。'" /><CollectionPagination :current-page="currentPage" :is-loading="isSearching" label="搜索结果分页" :on-page-change="(page: number) => void runSearch({ nextPage: page })" :page-size="currentPageSize" :total="totalResults" /></section>
      </div>
    </template>
  </div>
</template>
