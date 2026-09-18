<script lang="ts">
import type { KnowledgeItem, KnowledgeItemPage, ListKnowledgeItemsParams } from '../knowledgeDeskApi'
import type { KnowledgeWorkflowAction } from '../knowledgeDeskViewModel'
import { ref, watch, type Ref } from 'vue'

export type ListPageLoader = (params: ListKnowledgeItemsParams) => Promise<KnowledgeItemPage>

export interface ArchivePageProps {
  actionState: { itemId: string; action: KnowledgeWorkflowAction } | null
  apiEnabled: boolean
  items: KnowledgeItem[]
  isLoading?: boolean
  onItemAction: (item: KnowledgeItem, action: KnowledgeWorkflowAction) => Promise<void>
  onLoadPage: ListPageLoader
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
import { Archive } from '@lucide/vue'
import {
  EmptyState,
  ArchiveSkeleton,
  ErrorCard,
  VirtualList,
  useShouldVirtualize,
} from '../components'
import { FilterGroup, FilterSummary, MetaLine, StatusPill } from '../shared'
import { formatCount } from '../knowledgeDeskDisplay'
import {
  activeFilterCount,
  applyItemFilters,
  buildSourceOptions,
  buildTagOptions,
  buildWorkflowActions,
  toggleSingleFilterValue,
  emptyFilters,
  typeCopy,
  type ItemFilters,
} from '../knowledgeDeskViewModel'
import CollectionPagination from './CollectionPagination.vue'

const props = withDefaults(defineProps<ArchivePageProps>(), { isLoading: false })

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
  statuses: ['archived'],
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
const shouldVirtualize = computed(() => useShouldVirtualize(filteredItems.value.length))

function toggleFilter(field: 'source' | 'time' | 'tag', value: string) {
  filters.value = toggleSingleFilterValue(filters.value, field, value)
}
function clearFilters() {
  filters.value = emptyFilters
}

function getRestoreAction(item: KnowledgeItem) {
  return buildWorkflowActions(item).find((action) => action.id === 'restore')
}
function isRestoring(item: KnowledgeItem) {
  return props.actionState?.itemId === item.id && props.actionState.action === 'restore'
}
function restoreItem(item: KnowledgeItem) {
  const action = getRestoreAction(item)
  if (action) void props.onItemAction(item, action.id)
}
</script>

<template>
  <ArchiveSkeleton v-if="isLoading" v-bind="$attrs" />
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
      <header class="kd-page-identity kd-page-identity--archive">
        <div>
          <p>QUIET STORAGE / ARCHIVE</p>
          <h2>暂时退出视野的资料，依然留在你的索引里。</h2>
          <span>归档不是删除；它只是从当前工作流中安静退场。</span>
        </div>
        <strong aria-hidden="true">03</strong>
      </header>
      <div class="kd-page-tools">
        <div>
          <h2 class="kd-section-title">当前页 {{ formatCount(filteredItems.length) }} / {{ formatCount(pageData.total) }} 条归档资料</h2>
          <p class="kd-muted">
            {{
              apiEnabled
                ? (hasActiveFilters ? '筛选和分页均来自本机服务端全库。' : '归档不会丢失资料，后续仍可恢复。')
                : '后端未连接，当前仅筛选已加载条目。'
            }}
          </p>
        </div>
      </div>

      <ErrorCard
        v-if="pageError"
        description="服务端分页暂不可用，当前保留已加载条目。"
        :error="pageError"
        :on-retry="() => void requestPage(pageData.page)"
        retry-label="重试加载"
        title="归档库加载失败"
      />

      <div class="kd-library-list">
        <VirtualList
          v-if="shouldVirtualize"
          :items="filteredItems"
          :estimate-size="130"
        >
          <template #default="{ item }">
            <article class="kd-archive-item">
              <button class="kd-archive-main" type="button" @click="onOpenDetail(item)">
                <div class="kd-type-badge">{{ typeCopy[item.type] }}</div>
                <div class="kd-row-titleline">
                  <h3>{{ item.title }}</h3>
                  <StatusPill v-if="item.status" :status="item.status!" />
                </div>
                <p>{{ item.summary }}</p>
                <MetaLine :item="item" />
              </button>
              <button
                v-if="getRestoreAction(item)"
                :class="`kd-action-button kd-action-button--${getRestoreAction(item)!.tone}`"
                :disabled="isRestoring(item)"
                type="button"
                @click="restoreItem(item)"
              >
                {{ isRestoring(item) ? '恢复中' : getRestoreAction(item)!.label }}
              </button>
            </article>
          </template>
          <template #empty>
            <EmptyState
              :icon="Archive"
              :title="hasActiveFilters ? '没有匹配当前筛选的归档资料' : '归档库还是空的'"
              :description="hasActiveFilters
                ? '清空部分筛选条件，或换一个来源、标签、时间范围再找。'
                : '把不想参与当前知识流的资料归档后，这里会保留恢复入口。'"
            />
          </template>
        </VirtualList>
        <template v-else>
          <article v-for="item in filteredItems" :key="item.id" class="kd-archive-item">
            <button class="kd-archive-main" type="button" @click="onOpenDetail(item)">
              <div class="kd-type-badge">{{ typeCopy[item.type] }}</div>
                <div class="kd-row-titleline">
                  <h3>{{ item.title }}</h3>
                  <StatusPill v-if="item.status" :status="item.status!" />
                </div>
                <p>{{ item.summary }}</p>
                <MetaLine :item="item" />
            </button>
            <button
              v-if="getRestoreAction(item)"
              :class="`kd-action-button kd-action-button--${getRestoreAction(item)!.tone}`"
              :disabled="isRestoring(item)"
              type="button"
              @click="restoreItem(item)"
            >
              {{ isRestoring(item) ? '恢复中' : getRestoreAction(item)!.label }}
            </button>
          </article>
          <EmptyState
            v-if="filteredItems.length === 0"
            :icon="Archive"
            :title="hasActiveFilters ? '没有匹配当前筛选的归档资料' : '归档库还是空的'"
            :description="hasActiveFilters
              ? '清空部分筛选条件，或换一个来源、标签、时间范围再找。'
              : '把不想参与当前知识流的资料归档后，这里会保留恢复入口。'"
          />
        </template>
      </div>

      <CollectionPagination
        :current-page="pageData.page"
        :is-loading="isPageLoading"
        label="归档库分页"
        :on-page-change="(page: number) => void requestPage(page)"
        :page-size="pageData.pageSize"
        :total="pageData.total"
      />
    </div>
  </div>
</template>
