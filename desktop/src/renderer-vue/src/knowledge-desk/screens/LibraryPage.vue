<script lang="ts">
import type { KnowledgeItem, KnowledgeItemPage, ListKnowledgeItemsParams } from '../knowledgeDeskApi'
import { ref, watch, type Ref } from 'vue'

export type ListPageLoader = (params: ListKnowledgeItemsParams) => Promise<KnowledgeItemPage>

export interface LibraryPageProps {
  apiEnabled: boolean
  items: KnowledgeItem[]
  isLoading?: boolean
  mode: 'list' | 'cards'
  onLoadPage: ListPageLoader
  onModeChange: (mode: 'list' | 'cards') => void
  onOpenDetail: (item: KnowledgeItem) => void
  tags: string[]
}

const LIST_PAGE_SIZE = 20

function buildLocalKnowledgeItemPage(
  items: KnowledgeItem[],
  requestedPage: number,
  pageSize = LIST_PAGE_SIZE,
): KnowledgeItemPage {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
  const page = Math.min(Math.max(requestedPage, 1), totalPages)
  const start = (page - 1) * pageSize
  return {
    items: items.slice(start, start + pageSize),
    total: items.length,
    page,
    pageSize,
  }
}

// Mirrors the React `usePagedKnowledgeItems` hook. Accepts reactive refs for the
// inputs so the initial + dependency-driven requests stay in sync (useEffect on
// [requestPage] in React). `requestRef` guards against stale async resolutions.
function usePagedKnowledgeItems(opts: {
  apiEnabled: Ref<boolean>
  fallbackItems: Ref<KnowledgeItem[]>
  loadPage: Ref<ListPageLoader>
  params: Ref<Omit<ListKnowledgeItemsParams, 'page' | 'pageSize'>>
}) {
  const { apiEnabled, fallbackItems, loadPage, params } = opts

  const pageData = ref<KnowledgeItemPage>(buildLocalKnowledgeItemPage(fallbackItems.value, 1))
  const isPageLoading = ref(false)
  const pageError = ref<string | null>(null)
  const requestRef = ref(0)

  const requestPage = async (requestedPage: number) => {
    const requestId = requestRef.value + 1
    requestRef.value = requestId
    const localPage = buildLocalKnowledgeItemPage(fallbackItems.value, requestedPage)

    if (!apiEnabled.value) {
      pageError.value = null
      pageData.value = localPage
      return
    }

    isPageLoading.value = true
    pageError.value = null
    try {
      const nextPage = await loadPage.value({ ...params.value, page: requestedPage, pageSize: LIST_PAGE_SIZE })
      if (requestRef.value === requestId) {
        pageData.value = nextPage
      }
    } catch (error) {
      if (requestRef.value === requestId) {
        pageError.value = error instanceof Error ? error.message : String(error)
        pageData.value = pageData.value.items.length > 0 ? pageData.value : localPage
      }
    } finally {
      if (requestRef.value === requestId) {
        isPageLoading.value = false
      }
    }
  }

  watch(
    [apiEnabled, fallbackItems, loadPage, params],
    () => {
      void requestPage(1)
    },
    { immediate: true },
  )

  return { isPageLoading, pageData, pageError, requestPage }
}

// Local helpers (defined standalone in the React source, not part of knowledgeDeskViewModel).
const serverSearchSourceType = (
  source: string | undefined,
): 'web' | 'pdf' | 'markdown' | 'snippet' | undefined => {
  if (source === '网页摘录') return 'web'
  if (source === 'PDF') return 'pdf'
  if (source === 'Markdown') return 'markdown'
  if (source === '粘贴内容') return 'snippet'
  return undefined
}

const serverSearchDateRange = (ranges: string[]) => {
  const range = ranges[0]
  if (!range) return {}

  const now = new Date()
  const from = new Date(now)
  from.setHours(0, 0, 0, 0)

  if (range === '更早') {
    const endOfPreviousMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    endOfPreviousMonth.setMilliseconds(-1)
    return { to: endOfPreviousMonth.toISOString() }
  }
  if (range === '本周') {
    from.setDate(from.getDate() - ((from.getDay() + 6) % 7))
  } else if (range === '本月') {
    from.setDate(1)
  } else if (range !== '今天') {
    return {}
  }

  return { from: from.toISOString(), to: now.toISOString() }
}
</script>

<script setup lang="ts">
import { computed, toRef } from 'vue'
import { BookOpen, ListFilter, LayoutGrid } from '@lucide/vue'
import {
  EmptyState,
  LibrarySkeleton,
  ErrorCard,
  VirtualList,
  useShouldVirtualize,
} from '../components'
import { FilterGroup, FilterSummary, MetaLine } from '../shared'
import { formatCount } from '../knowledgeDeskDisplay'
import {
  activeFilterCount,
  applyItemFilters,
  buildSourceOptions,
  buildTagOptions,
  toggleSingleFilterValue,
  emptyFilters,
  typeCopy,
  type ItemFilters,
} from '../knowledgeDeskViewModel'
import CollectionPagination from './CollectionPagination.vue'

const props = withDefaults(defineProps<LibraryPageProps>(), { isLoading: false })

// Multi-root (skeleton vs layout) — forward attrs explicitly so an externally
// supplied class is not silently dropped.
defineOptions({ inheritAttrs: false })

const filters = ref<ItemFilters>(emptyFilters)

const sourceOptions = computed(() =>
  Array.from(
    new Set(['网页摘录', 'PDF', 'Markdown', '粘贴内容', ...buildSourceOptions(props.items, [])]),
  ),
)
const tagOptions = computed(() =>
  Array.from(new Set([...props.tags, ...buildTagOptions(props.items, [])])).slice(0, 8),
)
const fallbackItems = computed(() => applyItemFilters(props.items, filters.value))
const pageParams = computed<ListKnowledgeItemsParams>(() => ({
  statuses: ['ready'],
  sourceType: serverSearchSourceType(filters.value.source[0]),
  tag: filters.value.tag[0],
  ...serverSearchDateRange(filters.value.time),
}))

const { isPageLoading, pageData, pageError, requestPage } = usePagedKnowledgeItems({
  apiEnabled: toRef(props, 'apiEnabled'),
  fallbackItems,
  loadPage: toRef(props, 'onLoadPage'),
  params: pageParams,
})

const filteredItems = computed(() => pageData.value.items)
const hasActiveFilters = computed(() => activeFilterCount(filters.value) > 0)
const shouldVirtualizeList = computed(
  () => useShouldVirtualize(filteredItems.value.length) && props.mode === 'list',
)

function toggleFilter(field: 'source' | 'time' | 'tag', value: string) {
  filters.value = toggleSingleFilterValue(filters.value, field, value)
}
function clearFilters() {
  filters.value = emptyFilters
}
</script>

<template>
  <LibrarySkeleton v-if="isLoading" v-bind="$attrs" />
  <div v-else class="kd-library-layout" v-bind="$attrs">
    <aside class="kd-filter-rail">
      <FilterGroup
        :active-values="filters.source"
        :on-toggle="(value: string) => toggleFilter('source', value)"
        selection-mode="single"
        title="来源"
        :values="sourceOptions"
      />
      <FilterGroup
        :active-values="filters.time"
        :on-toggle="(value: string) => toggleFilter('time', value)"
        selection-mode="single"
        title="时间"
        :values="['今天', '本周', '本月', '更早']"
      />
      <FilterGroup
        :active-values="filters.tag"
        :on-toggle="(value: string) => toggleFilter('tag', value)"
        selection-mode="single"
        title="主题"
        :values="tagOptions"
      />
      <FilterSummary
        :filters="filters"
        :on-clear="clearFilters"
        :result-count="filteredItems.length"
        :total-count="pageData.total"
      />
    </aside>

    <div class="kd-stack">
      <header class="kd-page-identity kd-page-identity--library">
        <div>
          <p>RECALL INDEX / LIBRARY</p>
          <h2>不是收藏夹，是能够重新找到的记忆。</h2>
          <span>用来源、时间和主题切开索引，回到真正需要的那一条。</span>
        </div>
        <strong aria-hidden="true">02</strong>
      </header>
      <div class="kd-page-tools">
        <div>
          <h2 class="kd-section-title">当前页 {{ formatCount(filteredItems.length) }} / {{ formatCount(pageData.total) }} 条知识条目</h2>
          <p class="kd-muted">
            {{
              apiEnabled
                ? (hasActiveFilters ? '筛选和分页均来自本机服务端全库。' : '按来源、标签、时间和文档类型找回全库内容。')
                : '后端未连接，当前仅筛选已加载条目。'
            }}
          </p>
        </div>
        <div class="kd-segmented">
          <button :class="mode === 'list' ? 'is-active' : ''" type="button" @click="onModeChange('list')">
            <ListFilter :size="15" /> 列表
          </button>
          <button :class="mode === 'cards' ? 'is-active' : ''" type="button" @click="onModeChange('cards')">
            <LayoutGrid :size="15" /> 卡片
          </button>
        </div>
      </div>

      <ErrorCard
        v-if="pageError"
        description="服务端分页暂不可用，当前保留已加载条目。"
        :error="pageError"
        :on-retry="() => void requestPage(pageData.page)"
        retry-label="重试加载"
        title="知识库加载失败"
      />

      <div :class="mode === 'list' ? 'kd-library-list' : 'kd-library-cards'">
        <VirtualList
          v-if="mode === 'list' && shouldVirtualizeList"
          :items="filteredItems"
          :estimate-size="140"
        >
          <template #default="{ item }">
            <article class="kd-library-item" @click="onOpenDetail(item)">
              <div class="kd-type-badge">{{ typeCopy[item.type] }}</div>
              <h3>{{ item.title }}</h3>
              <p>{{ item.summary }}</p>
              <MetaLine :item="item" />
            </article>
          </template>
          <template #empty>
            <EmptyState
              :icon="BookOpen"
              :title="hasActiveFilters ? '没有匹配当前筛选的条目' : '知识库还没有可检索条目'"
              :description="hasActiveFilters
                ? '清空部分筛选条件，或换一个来源、标签、时间范围再找。'
                : '完成整理后的资料会出现在这里，并支持按来源、标签、时间和文档类型筛选。'"
            />
          </template>
        </VirtualList>
        <template v-else>
          <article
            v-for="item in filteredItems"
            :key="item.id"
            class="kd-library-item"
            @click="onOpenDetail(item)"
          >
            <div class="kd-type-badge">{{ typeCopy[item.type] }}</div>
            <h3>{{ item.title }}</h3>
            <p>{{ item.summary }}</p>
            <MetaLine :item="item" />
          </article>
          <EmptyState
            v-if="filteredItems.length === 0"
            :icon="BookOpen"
            :title="hasActiveFilters ? '没有匹配当前筛选的条目' : '知识库还没有可检索条目'"
            :description="hasActiveFilters
              ? '清空部分筛选条件，或换一个来源、标签、时间范围再找。'
              : '完成整理后的资料会出现在这里，并支持按来源、标签、时间和文档类型筛选。'"
          />
        </template>
      </div>

      <CollectionPagination
        :current-page="pageData.page"
        :is-loading="isPageLoading"
        label="知识库分页"
        :on-page-change="(page: number) => void requestPage(page)"
        :page-size="pageData.pageSize"
        :total="pageData.total"
      />
    </div>
  </div>
</template>
