<script lang="ts">
import type {
  KnowledgeDeskSnapshot,
  KnowledgeItem,
  KnowledgeItemPage,
  ListKnowledgeItemsParams,
} from '../knowledgeDeskApi'
import type { InboxSegment, KnowledgeWorkflowAction } from '../knowledgeDeskViewModel'

type ListPageLoader = (params: ListKnowledgeItemsParams) => Promise<KnowledgeItemPage>

export interface InboxPageProps {
  actionState: { itemId: string; action: KnowledgeWorkflowAction } | null
  activeSegment: InboxSegment
  apiEnabled: boolean
  inboxTotals: KnowledgeDeskSnapshot['inboxTotals']
  isLoading?: boolean
  isOrganizing: boolean
  items: KnowledgeItem[]
  onItemAction: (item: KnowledgeItem, action: KnowledgeWorkflowAction) => Promise<void>
  onLoadPage: ListPageLoader
  onOpenDetail: (item: KnowledgeItem) => void
  onOrganizeBatch: () => void
  onSegmentChange: (segment: InboxSegment) => void
}
</script>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { Eye, Inbox, RefreshCw } from '@lucide/vue'
import {
  EmptyState,
  ErrorCard,
  InboxSkeleton,
  VirtualList,
  useShouldVirtualize,
} from '../components'
import { MetaLine, StatusPill } from '../shared'
import { sourceIcon } from '../knowledgeDeskDisplay'
import {
  buildInboxSegments,
  buildWorkflowActions,
  filterInboxItems,
  inboxStatusesForSegment,
  type WorkflowActionDescriptor,
} from '../knowledgeDeskViewModel'
import CollectionPagination from './CollectionPagination.vue'

defineOptions({ inheritAttrs: false })

const props = defineProps<InboxPageProps>()

const LIST_PAGE_SIZE = 20

const buildLocalKnowledgeItemPage = (
  items: KnowledgeItem[],
  requestedPage: number,
  pageSize = LIST_PAGE_SIZE,
): KnowledgeItemPage => {
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

const fallbackItems = computed(() => filterInboxItems(props.items, props.activeSegment))
const serverStatuses = computed(() => inboxStatusesForSegment(props.activeSegment))
const pageParams = computed<ListKnowledgeItemsParams>(() => ({
  statuses: [...serverStatuses.value],
}))

const pageData = ref<KnowledgeItemPage>(buildLocalKnowledgeItemPage(fallbackItems.value, 1))
const isPageLoading = ref(false)
const pageError = ref<string | null>(null)
const requestRef = ref(0)

async function requestPage(requestedPage: number) {
  const requestId = requestRef.value + 1
  requestRef.value = requestId
  const localPage = buildLocalKnowledgeItemPage(fallbackItems.value, requestedPage)

  if (!props.apiEnabled) {
    pageError.value = null
    pageData.value = localPage
    return
  }

  isPageLoading.value = true
  pageError.value = null
  try {
    const nextPage = await props.onLoadPage({ ...pageParams.value, page: requestedPage, pageSize: LIST_PAGE_SIZE })
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

onMounted(() => {
  void requestPage(1)
})

watch(
  [() => props.apiEnabled, fallbackItems, pageParams, () => props.onLoadPage],
  () => {
    void requestPage(1)
  },
)

const visibleItems = computed(() => pageData.value.items)
const shouldVirtualize = useShouldVirtualize(() => visibleItems.value.length)
const inboxSegments = computed(() =>
  buildInboxSegments(props.items, props.apiEnabled ? props.inboxTotals : undefined),
)

const emptyTitle = computed(() =>
  props.activeSegment === 'all' ? '收集箱是空的' : '当前分段没有条目',
)
const emptyDescription = computed(() =>
  props.activeSegment === 'all'
    ? '网页摘录、本机文档和粘贴内容会先进入这里，再被整理进知识库。'
    : '切回全部，或继续导入资料后再处理。',
)

function isPendingAction(item: KnowledgeItem, action: WorkflowActionDescriptor): boolean {
  return (
    props.actionState?.itemId === item.id && props.actionState?.action === action.id
  )
}

function handleItemAction(item: KnowledgeItem, actionId: KnowledgeWorkflowAction) {
  void props.onItemAction(item, actionId)
}

function handlePageChange(page: number) {
  void requestPage(page)
}
</script>

<template>
  <InboxSkeleton v-if="isLoading" />

  <div v-else class="kd-stack kd-inbox-stack" v-bind="$attrs">
    <header class="kd-page-identity kd-page-identity--inbox">
      <div>
        <p>INTAKE QUEUE / INBOX</p>
        <h2>把尚未成形的资料，先放进可靠的队列。</h2>
        <span>每一条都会保留来源和状态，等你决定下一步。</span>
      </div>
      <strong aria-hidden="true">01</strong>
    </header>

    <div class="kd-page-tools">
      <div class="kd-segmented">
        <button
          v-for="segment in inboxSegments"
          :key="segment.id"
          type="button"
          :class="activeSegment === segment.id ? 'is-active' : ''"
          @click="onSegmentChange(segment.id)"
        >
          <span>{{ segment.label }}</span>
          <span class="kd-segment-count">{{ segment.count }}</span>
        </button>
      </div>
      <div class="kd-tool-actions">
        <button
          type="button"
          :disabled="isOrganizing || visibleItems.length === 0"
          @click="onOrganizeBatch()"
        >
          <RefreshCw :size="16" /> {{ isOrganizing ? '整理中' : '批量整理' }}
        </button>
        <span class="kd-tool-note">
          {{
            apiEnabled
              ? `当前页 ${visibleItems.length} / ${pageData.total} 条`
              : `当前已加载 ${pageData.total} 条`
          }}，需要优先处理的失败条目会保留在这里。
        </span>
      </div>
    </div>

    <ErrorCard
      v-if="pageError"
      description="服务端分页暂不可用，当前保留已加载条目。"
      :error="pageError"
      :on-retry="() => void requestPage(pageData.page)"
      retry-label="重试加载"
      title="收集箱加载失败"
    />

    <section class="kd-inbox-board">
      <VirtualList v-if="shouldVirtualize" :items="visibleItems" :estimate-size="130">
        <template #empty>
          <EmptyState :icon="Inbox" :title="emptyTitle" :description="emptyDescription" />
        </template>
        <template #default="{ item }">
          <article :class="`kd-inbox-row kd-inbox-row--${item.status}`">
            <div class="kd-source-icon">
              <component :is="sourceIcon(item.type)" :size="18" />
            </div>
            <div class="kd-row-main">
              <div class="kd-row-titleline">
                <h3>{{ item.title }}</h3>
                <StatusPill v-if="item.status" :status="item.status" />
              </div>
              <p>{{ item.summary }}</p>
              <MetaLine :item="item" />
            </div>
            <div class="kd-row-actions">
              <button class="kd-icon-button" type="button" aria-label="查看详情" @click="onOpenDetail(item)">
                <Eye :size="17" />
              </button>
              <button
                v-for="action in buildWorkflowActions(item)"
                :key="action.id"
                type="button"
                :class="`kd-action-button kd-action-button--${action.tone}`"
                :disabled="isPendingAction(item, action)"
                @click="handleItemAction(item, action.id)"
              >
                {{ isPendingAction(item, action) ? '处理中' : action.label }}
              </button>
            </div>
          </article>
        </template>
      </VirtualList>

      <template v-else>
        <article
          v-for="item in visibleItems"
          :key="item.id"
          :class="`kd-inbox-row kd-inbox-row--${item.status}`"
        >
          <div class="kd-source-icon">
            <component :is="sourceIcon(item.type)" :size="18" />
          </div>
          <div class="kd-row-main">
            <div class="kd-row-titleline">
              <h3>{{ item.title }}</h3>
              <StatusPill v-if="item.status" :status="item.status" />
            </div>
            <p>{{ item.summary }}</p>
            <MetaLine :item="item" />
          </div>
          <div class="kd-row-actions">
            <button class="kd-icon-button" type="button" aria-label="查看详情" @click="onOpenDetail(item)">
              <Eye :size="17" />
            </button>
            <button
              v-for="action in buildWorkflowActions(item)"
              :key="action.id"
              type="button"
              :class="`kd-action-button kd-action-button--${action.tone}`"
              :disabled="isPendingAction(item, action)"
              @click="handleItemAction(item, action.id)"
            >
              {{ isPendingAction(item, action) ? '处理中' : action.label }}
            </button>
          </div>
        </article>
        <EmptyState
          v-if="visibleItems.length === 0"
          :icon="Inbox"
          :title="emptyTitle"
          :description="emptyDescription"
        />
      </template>
    </section>

    <CollectionPagination
      :current-page="pageData.page"
      :is-loading="isPageLoading"
      label="收集箱分页"
      :on-page-change="handlePageChange"
      :page-size="pageData.pageSize"
      :total="pageData.total"
    />
  </div>
</template>
