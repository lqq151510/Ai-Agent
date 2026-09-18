<script lang="ts">
import type { DashboardSummary, KnowledgeItem } from '../knowledgeDeskApi'

export interface DashboardPageProps {
  dashboard: DashboardSummary
  inboxItems: KnowledgeItem[]
  isLoading: boolean
  libraryItems: KnowledgeItem[]
  onOpenImport: () => void
  onOpenDetail: (item: KnowledgeItem) => void
  onOpenReview: () => void
  tags: string[]
}
</script>

<script setup lang="ts">
import { computed } from 'vue'
import { BookOpen, CheckCircle2, Clock3, Inbox, Plus, Tags } from '@lucide/vue'
import { ItemList, MetricCard, Panel, TimelineItem } from '../shared'
import { DashboardSkeleton } from '../components'
import { formatCount } from '../knowledgeDeskDisplay'

defineOptions({ inheritAttrs: false })

const props = defineProps<DashboardPageProps>()

const recentItems = computed(() =>
  props.dashboard.recentItems.length > 0 ? props.dashboard.recentItems : props.libraryItems,
)
const topTags = computed(() =>
  props.dashboard.topTags.length > 0
    ? props.dashboard.topTags.map((tag) => tag.name)
    : props.tags,
)
</script>

<template>
  <DashboardSkeleton v-if="isLoading" />

  <div v-else class="kd-stack" v-bind="$attrs">
    <section class="kd-search-hero kd-search-hero--index">
      <div class="kd-index-hero-copy">
        <p><span class="kd-index-hero-signal" /> INDEX / TODAY</p>
        <h2>让每一条新线索<br /><em>在需要时重新出现。</em></h2>
        <span class="kd-index-hero-caption">收集、整理、连接、回顾。你的资料不会再散落在不同地方。</span>
      </div>
      <div aria-hidden="true" class="kd-index-hero-map">
        <img alt="" class="kd-index-hero-image" src="/knowledge-desk-index-v1.png" />
        <div class="kd-index-hero-map-lines">
          <span>01 / CAPTURE</span>
          <span>02 / INDEX</span>
          <span>03 / RECALL</span>
        </div>
      </div>
      <button class="kd-primary-button" type="button" @click="onOpenImport()">
        <Plus :size="17" />
        录入线索
      </button>
    </section>

    <div class="kd-stat-grid">
      <MetricCard
        :icon="Plus"
        label="今日新增"
        :value="String(inboxItems.length)"
        :detail="isLoading ? '正在同步本地知识库' : '来自收集箱最新条目'"
      />
      <MetricCard
        :icon="CheckCircle2"
        label="整理完成"
        :value="formatCount(dashboard.readyItems)"
        detail="已进入可检索知识库"
      />
      <MetricCard
        :icon="Inbox"
        label="待处理收集箱"
        :value="formatCount(dashboard.inboxItems)"
        :detail="`${dashboard.failedItems} 条需要重试`"
      />
      <MetricCard
        :icon="BookOpen"
        label="知识总量"
        :value="formatCount(dashboard.totalItems)"
        detail="网页 / 本机文档 / 摘录统一索引"
      />
    </div>

    <button class="kd-review-dashboard-card" type="button" @click="onOpenReview()">
      <span><Clock3 :size="17" /> 每日回顾</span>
      <strong>{{ formatCount(dashboard.review.dueCount) }} 条</strong>
      <p>{{
        dashboard.review.dueCount > 0
          ? '先凭记忆找回，再选择下一次回顾间隔。'
          : '今天已完成回顾，继续收集新资料吧。'
      }}</p>
      <em>进入回顾 →</em>
    </button>

    <div class="kd-two-column">
      <Panel title="最近整理完成" :icon="CheckCircle2">
        <ItemList
          empty-text="暂无整理完成的条目"
          :items="recentItems.slice(0, 3)"
          :on-open-detail="onOpenDetail"
        />
      </Panel>
      <Panel title="待处理收集箱" :icon="Inbox">
        <ItemList empty-text="收集箱已清空" :items="inboxItems.slice(0, 3)" />
      </Panel>
    </div>

    <div class="kd-two-column kd-two-column--soft">
      <Panel title="高频标签" :icon="Tags">
        <div class="kd-tag-cloud">
          <span v-for="tag in topTags.slice(0, 12)" :key="tag" class="kd-tag">{{ tag }}</span>
          <span v-if="topTags.length === 0" class="kd-muted">暂无标签，导入并整理资料后会自动生成。</span>
        </div>
      </Panel>
      <Panel title="最近访问" :icon="Clock3">
        <div class="kd-timeline">
          <TimelineItem v-for="item in recentItems.slice(0, 3)" :key="item.id" :item="item" />
          <template v-if="recentItems.length === 0">
            <span>--</span>
            <strong>暂无访问记录</strong>
          </template>
        </div>
      </Panel>
    </div>
  </div>
</template>
